const test = require('node:test');
const assert = require('node:assert/strict');
const { createAlertRefreshStream } = require('./alertRefreshStream');

class FakeRequest {
  open(method, url) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader() {}

  send() {
    this.responseText = '';
    this.readyState = 2;
  }

  append(chunk) {
    this.responseText += chunk;
    this.readyState = 3;
    this.onreadystatechange?.();
  }

  abort() {
    this.aborted = true;
  }
}

test('React Native XHR fallback refreshes once per complete alert event', () => {
  let request;
  let refreshes = 0;
  const stream = createAlertRefreshStream('https://pool.test/events', () => { refreshes += 1; }, {
    EventSourceImpl: null,
    XMLHttpRequestImpl: class extends FakeRequest {
      constructor() {
        super();
        request = this;
      }
    },
  });

  request.append('event: ready\ndata: {}\n\nevent: alerts\ndata: {"reason":"responding"}')
  assert.equal(refreshes, 0);
  request.append('\n\nevent: alerts\ndata: {"reason":"resolved"}\n\n')
  assert.equal(refreshes, 2);

  stream.close();
  assert.equal(request.aborted, true);
});
