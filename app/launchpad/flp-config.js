/* Launchpad content for the UI5 sandbox shell. The sandbox merges its own sample content over this
   object, so the home page group and the catalog are pinned (see pin()). */
(function () {
  'use strict';

  var apps = [
    { id: 'agent', intent: 'Agent-display', title: 'Agent', subtitle: 'Run and watch cases', icon: 'sap-icon://process', url: '../agent/webapp/index.html' },
    { id: 'playbooks', intent: 'Playbook-manage', title: 'Playbooks', subtitle: 'Review and sign', icon: 'sap-icon://approvals', url: '../playbooks/webapp/index.html' },
    { id: 'calculator', intent: 'TokenSavings-display', title: 'Calculator', subtitle: 'Estimate savings', icon: 'sap-icon://simulate', url: '../calculator/webapp/index.html' },
    { id: 'joule', intent: 'JouleAgent-display', title: 'Joule', subtitle: 'Call it over A2A', icon: 'sap-icon://discussion', url: '../joule/webapp/index.html' },
  ];

  var tiles = apps.map(function (a) {
    return {
      id: 'zt_tile_' + a.id,
      title: a.title,
      size: '1x1',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: {
        chipId: 'zt_chip_' + a.id,
        title: a.title,
        subtitle: a.subtitle,
        icon: a.icon,
        targetURL: '#' + a.intent,
      },
    };
  });

  var applications = {};
  apps.forEach(function (a) {
    applications[a.intent] = {
      title: a.title,
      description: a.title,
      applicationType: 'URL',
      additionalInformation: 'managed=FioriWave1',
      url: a.url,
    };
  });

  function pin(target, key, value) {
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: false,
      get: function () { return value; },
      set: function () {},
    });
  }

  var launchPage = {};
  pin(launchPage, 'groups', [{ id: 'zt_group_main', title: 'Zero-token agent', isPreset: true, isVisible: true, isGroupLocked: false, tiles: tiles }]);
  pin(launchPage, 'catalogs', [{ id: 'zt_catalog', title: 'Zero-token agent', tiles: tiles }]);

  window['sap-ushell-config'] = {
    defaultRenderer: 'fiori2',
    renderers: {
      fiori2: {
        componentData: {
          config: {
            enableSearch: false,
            enableUserDefaultParameters: false,
            enablePersonalization: false,
            enableHelp: false,
            enableNotificationsUI: false,
            enableRecentActivity: false,
            rootIntent: 'Shell-home',
          },
        },
      },
    },
    services: {
      Container: {
        adapter: {
          config: {
            id: 'ZT_USER',
            firstName: 'Zero-token',
            lastName: 'Agent',
            fullName: 'Zero-token agent',
            bootTheme: { theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'sap_fiori_3_dark' : 'sap_fiori_3', root: '' },
            detectDarkMode: true,
          },
        },
      },
      LaunchPage: { adapter: { config: launchPage } },
      NavTargetResolution: {
        config: { allowTestUrlComponentConfig: false, enableClientSideTargetResolution: true },
        adapter: { config: { applications: applications } },
      },
      SupportTicket: { config: { enabled: false } },
      SmartNavigation: { config: { isTrackingEnabled: false } },
    },
  };
})();
