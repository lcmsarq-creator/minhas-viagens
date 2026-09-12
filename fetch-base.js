(() => {
  "use strict";
  if (!window.__mvNativeFetch) window.__mvNativeFetch = window.fetch.bind(window);
})();
