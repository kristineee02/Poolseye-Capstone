function createAlertRefreshStream(streamUrl, onAlert, implementations = {}) {
  if (!streamUrl || typeof onAlert !== 'function') return null;

  const EventSourceImpl = implementations.EventSourceImpl ?? globalThis.EventSource;
  if (typeof EventSourceImpl !== 'undefined') {
    const stream = new EventSourceImpl(streamUrl);
    stream.addEventListener?.('alerts', onAlert);
    return stream;
  }

  // React Native does not expose EventSource on every runtime, but its XHR
  // implementation delivers incremental responseText while an SSE request is
  // open. Polling in useAutoRefresh remains the reconnect/offline fallback.
  const XMLHttpRequestImpl = implementations.XMLHttpRequestImpl ?? globalThis.XMLHttpRequest;
  if (typeof XMLHttpRequestImpl === 'undefined') return null;

  const request = new XMLHttpRequestImpl();
  let offset = 0;
  let buffered = '';
  let closed = false;

  request.onreadystatechange = () => {
    if (closed || request.readyState < 3) return;
    let responseText = '';
    try {
      responseText = request.responseText || '';
    } catch {
      return;
    }
    if (responseText.length < offset) offset = 0;
    buffered += responseText.slice(offset);
    offset = responseText.length;

    const frames = buffered.split(/\r?\n\r?\n/);
    buffered = frames.pop() || '';
    for (const frame of frames) {
      if (/^event:\s*alerts\s*$/m.test(frame)) onAlert();
    }
  };
  request.open('GET', streamUrl, true);
  request.setRequestHeader?.('Accept', 'text/event-stream');
  request.send();

  return {
    close() {
      closed = true;
      request.onreadystatechange = null;
      request.abort?.();
    },
  };
}

module.exports = { createAlertRefreshStream };
