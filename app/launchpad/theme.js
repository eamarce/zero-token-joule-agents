(function () {
  'use strict';
  var query = window.matchMedia('(prefers-color-scheme: dark)');
  function themeName() { return query.matches ? 'sap_fiori_3_dark' : 'sap_fiori_3'; }

  var uiConfig = (window['sap-ui-config'] = window['sap-ui-config'] || {});
  uiConfig.theme = themeName();

  query.addEventListener('change', function () {
    if (window.sap && window.sap.ui && window.sap.ui.require) {
      window.sap.ui.require(['sap/ui/core/Theming'], function (Theming) { Theming.setTheme(themeName()); });
    }
  });
})();
