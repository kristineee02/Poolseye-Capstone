function demoEmergencyOutputsEnabled() {
  return String(process.env.ALLOW_DEMO_EMERGENCY_OUTPUTS || '').toLowerCase() === 'true'
}

function isUploadedVideoEvent(event) {
  return event?.camera === 'UPLOAD' || event?.detection_source === 'Uploaded Video'
}

function externalOutputsAllowed(event) {
  return !isUploadedVideoEvent(event) || demoEmergencyOutputsEnabled()
}

const DEMO_EVENT_SQL = "COALESCE(camera, '') <> 'UPLOAD' AND COALESCE(detection_source, '') <> 'Uploaded Video'"

module.exports = {
  DEMO_EVENT_SQL,
  demoEmergencyOutputsEnabled,
  externalOutputsAllowed,
  isUploadedVideoEvent,
}
