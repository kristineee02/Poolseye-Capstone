"""
PoolsEye - Camera Calibration and Spatial Transformation Engine.

Maps 2D CCTV image pixel coordinates (u, v) to real-world metric coordinates (X, Y)
in meters using planar homography matrices and camera perspective geometry.
"""

from __future__ import annotations

import math
from typing import List, Tuple, Optional, Dict, Any
import numpy as np
import cv2


class SpatialCalibrator:
    """
    Computes and applies spatial transformation matrices (Homography) to convert
    pixel coordinates from CCTV video frames into metric ground/water coordinates (meters).
    """

    def __init__(
        self,
        homography_matrix: Optional[np.ndarray] = None,
        pool_width_m: float = 15.0,
        pool_length_m: float = 25.0,
        frame_size: Tuple[int, int] = (1920, 1080),
    ):
        self.pool_width_m = float(pool_width_m)
        self.pool_length_m = float(pool_length_m)
        self.frame_size = frame_size  # (width, height)

        if homography_matrix is not None:
            self.H = np.array(homography_matrix, dtype=np.float64)
            if self.H.shape != (3, 3):
                raise ValueError(f"Homography matrix must be 3x3, got {self.H.shape}")
            self.H_inv = np.linalg.inv(self.H)
        else:
            # Default to perspective mapping based on pool bounds and frame size
            self.H, self.H_inv = self._build_default_homography(
                pool_width_m, pool_length_m, frame_size
            )

    @classmethod
    def from_reference_points(
        cls,
        image_points: List[Tuple[float, float]],
        metric_points: List[Tuple[float, float]],
        frame_size: Tuple[int, int] = (1920, 1080),
        pool_width_m: float = 15.0,
        pool_length_m: float = 25.0,
    ) -> "SpatialCalibrator":
        """
        Calibrate using 4 known correspondence points between image pixels and metric ground coordinates.
        image_points: [(u0, v0), (u1, v1), (u2, v2), (u3, v3)]
        metric_points: [(X0, Y0), (X1, Y1), (X2, Y2), (X3, Y3)] in meters
        """
        if len(image_points) != 4 or len(metric_points) != 4:
            raise ValueError("Exactly 4 reference point pairs are required for homography calibration.")

        src = np.array(image_points, dtype=np.float32)
        dst = np.array(metric_points, dtype=np.float32)

        H = cv2.getPerspectiveTransform(src, dst)
        return cls(
            homography_matrix=H,
            pool_width_m=pool_width_m,
            pool_length_m=pool_length_m,
            frame_size=frame_size,
        )

    @classmethod
    def from_zone_polygon(
        cls,
        polygon_points: List[Tuple[float, float]],
        pool_width_m: float = 15.0,
        pool_length_m: float = 25.0,
        frame_size: Tuple[int, int] = (1920, 1080),
    ) -> "SpatialCalibrator":
        """
        Derive homography automatically from a 4-point pool zone polygon (e.g. pool perimeter in CCTV).
        Sorts points as: [top-left, top-right, bottom-right, bottom-left].
        Maps to metric rectangle: [(0, 0), (W_m, 0), (W_m, L_m), (0, L_m)].
        """
        if len(polygon_points) < 4:
            return cls(pool_width_m=pool_width_m, pool_length_m=pool_length_m, frame_size=frame_size)

        pts = np.array(polygon_points[:4], dtype=np.float32)
        # Order points: top-left, top-right, bottom-right, bottom-left
        ordered = cls._order_quad_points(pts)

        metric_pts = np.array(
            [
                [0.0, 0.0],
                [pool_width_m, 0.0],
                [pool_width_m, pool_length_m],
                [0.0, pool_length_m],
            ],
            dtype=np.float32,
        )

        try:
            H = cv2.getPerspectiveTransform(ordered, metric_pts)
            return cls(
                homography_matrix=H,
                pool_width_m=pool_width_m,
                pool_length_m=pool_length_m,
                frame_size=frame_size,
            )
        except Exception as e:
            print(f"[calibration] Warning: Failed to compute homography from zone ({e}), using default.")
            return cls(pool_width_m=pool_width_m, pool_length_m=pool_length_m, frame_size=frame_size)

    @classmethod
    def from_config(cls, cfg: Dict[str, Any], frame_w: int, frame_h: int) -> "SpatialCalibrator":
        """
        Build calibrator from application config dictionary (config.json).
        Checks:
        1. CALIBRATION.homography_matrix
        2. CALIBRATION.reference_points
        3. ZONES pool boundary
        4. SUPERVISION dimensions
        """
        cal_cfg = cfg.get("CALIBRATION", {})
        sup_cfg = cfg.get("SUPERVISION", {})
        pool_w = float(sup_cfg.get("pool_real_width_meters") or cal_cfg.get("pool_real_width_meters", 15.0))
        pool_l = float(sup_cfg.get("pool_real_length_meters") or cal_cfg.get("pool_real_length_meters", 25.0))
        frame_size = (frame_w, frame_h)

        # 1. Direct homography matrix provided
        h_matrix = cal_cfg.get("homography_matrix") or sup_cfg.get("homography_matrix")
        if h_matrix and len(h_matrix) == 3:
            return cls(np.array(h_matrix, dtype=np.float64), pool_w, pool_l, frame_size)

        # 2. Reference points provided
        ref_pts = cal_cfg.get("reference_points")
        if ref_pts and "image" in ref_pts and "metric" in ref_pts:
            return cls.from_reference_points(
                ref_pts["image"], ref_pts["metric"], frame_size, pool_w, pool_l
            )

        # 3. Derive from pool zone (red or yellow zone polygon)
        zones = cfg.get("ZONES", {})
        for zone_key in ("red", "yellow"):
            zone = zones.get(zone_key, {})
            pts = zone.get("points") or []
            if len(pts) >= 4:
                # Convert from zone coord_space to pixel coordinates
                coord_space = zones.get("coord_space", "editor")
                ew, eh = zones.get("editor_size", [1000, 512])
                px_pts = []
                for x, y in pts[:4]:
                    if coord_space == "editor":
                        px_pts.append(((x / ew) * frame_w, (y / eh) * frame_h))
                    elif coord_space == "normalized":
                        px_pts.append((x * frame_w, y * frame_h))
                    else:
                        px_pts.append((float(x), float(y)))
                return cls.from_zone_polygon(px_pts, pool_w, pool_l, frame_size)

        # 4. Fallback default
        return cls(None, pool_w, pool_l, frame_size)

    @staticmethod
    def _order_quad_points(pts: np.ndarray) -> np.ndarray:
        """Order 4 points: [top-left, top-right, bottom-right, bottom-left]."""
        rect = np.zeros((4, 2), dtype=np.float32)
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]      # top-left has smallest sum
        rect[2] = pts[np.argmax(s)]      # bottom-right has largest sum

        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]   # top-right has smallest diff
        rect[3] = pts[np.argmax(diff)]   # bottom-left has largest diff
        return rect

    def _build_default_homography(
        self, width_m: float, length_m: float, frame_size: Tuple[int, int]
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Construct a physically realistic perspective transformation matrix for an angled CCTV view.
        Camera mounted at top-edge looking down at pool surface.
        Near field (bottom of image) has larger pixel scale; far field (top of image) has smaller pixel scale.
        """
        fw, fh = frame_size
        # Typical CCTV pool viewport in frame:
        # Far boundary (top): narrower in pixels due to perspective foreshortening
        # Near boundary (bottom): wider in pixels
        src_pts = np.array(
            [
                [fw * 0.15, fh * 0.20],  # top-left (far)
                [fw * 0.85, fh * 0.20],  # top-right (far)
                [fw * 0.95, fh * 0.85],  # bottom-right (near)
                [fw * 0.05, fh * 0.85],  # bottom-left (near)
            ],
            dtype=np.float32,
        )

        dst_pts = np.array(
            [
                [0.0, 0.0],
                [width_m, 0.0],
                [width_m, length_m],
                [0.0, length_m],
            ],
            dtype=np.float32,
        )

        H = cv2.getPerspectiveTransform(src_pts, dst_pts)
        H_inv = cv2.getPerspectiveTransform(dst_pts, src_pts)
        return H, H_inv

    def pixel_to_metric(self, u: float, v: float) -> Tuple[float, float]:
        """
        Map CCTV image pixel coordinate (u, v) to ground metric plane coordinate (X, Y) in meters.
        """
        vec = np.array([u, v, 1.0], dtype=np.float64)
        m = self.H @ vec
        w = m[2] if abs(m[2]) > 1e-9 else 1e-9
        return float(m[0] / w), float(m[1] / w)

    def metric_to_pixel(self, x_m: float, y_m: float) -> Tuple[float, float]:
        """
        Map real-world ground coordinate (X, Y) in meters back to image pixel coordinate (u, v).
        """
        vec = np.array([x_m, y_m, 1.0], dtype=np.float64)
        p = self.H_inv @ vec
        w = p[2] if abs(p[2]) > 1e-9 else 1e-9
        return float(p[0] / w), float(p[1] / w)

    def calculate_distance(
        self, p1_pixel: Tuple[float, float], p2_pixel: Tuple[float, float]
    ) -> float:
        """
        Calculate precise real-world Euclidean distance in meters between two pixel locations
        (e.g. ground foot contact points of two individuals) on the CCTV ground plane.
        """
        x1, y1 = self.pixel_to_metric(p1_pixel[0], p1_pixel[1])
        x2, y2 = self.pixel_to_metric(p2_pixel[0], p2_pixel[1])
        return float(math.hypot(x2 - x1, y2 - y1))

    def get_proximity_circle_pixels(
        self,
        center_pixel: Tuple[float, float],
        radius_m: float = 0.7,
        num_points: int = 32,
    ) -> List[Tuple[int, int]]:
        """
        Project a circular boundary of radius_m (e.g. 0.7m) around a person's ground location
        into the CCTV camera image plane. Due to perspective projection, this circle projects
        as a precise ellipse matching the camera view angle.
        """
        cx_m, cy_m = self.pixel_to_metric(center_pixel[0], center_pixel[1])
        pixel_points = []
        for i in range(num_points):
            angle = (2.0 * math.pi * i) / num_points
            xm = cx_m + radius_m * math.cos(angle)
            ym = cy_m + radius_m * math.sin(angle)
            u, v = self.metric_to_pixel(xm, ym)
            pixel_points.append((int(round(u)), int(round(v))))
        return pixel_points
