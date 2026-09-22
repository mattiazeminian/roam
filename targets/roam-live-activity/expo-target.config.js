/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'RoamRunLiveActivity',
  bundleIdentifier: '.roam-live-activity',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'ActivityKit', 'WidgetKit'],
};
