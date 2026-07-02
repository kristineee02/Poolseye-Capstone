export default function Logo({ size = 44, className = '', alt = 'PoolsEye' }) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', display: 'block' }}
      draggable={false}
    />
  )
}
