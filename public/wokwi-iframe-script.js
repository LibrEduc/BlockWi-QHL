/**
 * À exécuter dans le contexte de l’iframe Wokwi pour recevoir les mises à jour
 * de code (postMessage type 'updateCode') et les appliquer à l’éditeur Monaco.
 * Fonctionne uniquement si l’iframe Wokwi est same-origin (ex. proxy local).
 * Avec wokwi.com en direct (cross-origin), l’injection est bloquée ; le postMessage
 * est quand même envoyé au cas où Wokwi l’écouterait côté serveur.
 */
window.addEventListener('message', function (event) {
  if (!event.data || event.data.type !== 'updateCode' || typeof event.data.code !== 'string') {
    return;
  }
  var code = event.data.code;

  function trySetMonacoValue(editor) {
    if (editor && typeof editor.getModel === 'function') {
      var model = editor.getModel();
      if (model && typeof model.setValue === 'function') {
        model.setValue(code);
        return true;
      }
    }
    return false;
  }

  var selectors = [
    '.monaco-scrollable-element.editor-scrollable.vs-dark',
    '.monaco-scrollable-element.editor-scrollable',
    '.monaco-editor'
  ];
  for (var i = 0; i < selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    if (el) {
      var editor = el.__monacoEditor || (window.monaco && window.monaco.editor && window.monaco.editor.getEditors && window.monaco.editor.getEditors()[0]);
      if (!editor && window.monaco && window.monaco.editor && window.monaco.editor.getModels) {
        var models = window.monaco.editor.getModels();
        if (models.length && window.monaco.editor.getEditors) {
          var editors = window.monaco.editor.getEditors();
          if (editors.length) editor = editors[0];
        }
      }
      if (trySetMonacoValue(editor)) return;
    }
  }
  if (window.monaco && window.monaco.editor) {
    var editors = window.monaco.editor.getEditors();
    if (editors.length && trySetMonacoValue(editors[0])) return;
  }
});
