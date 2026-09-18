(function () {
  const src = chrome.runtime.getURL("src/content/extractor.js");
  import(src);
})();
