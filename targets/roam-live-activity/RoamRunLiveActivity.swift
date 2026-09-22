import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

private func formatRunDuration(_ seconds: Int) -> String {
  let total = max(0, seconds)
  let hours = total / 3600
  let minutes = (total % 3600) / 60
  let secs = total % 60
  if hours > 0 {
    return String(format: "%d:%02d:%02d", hours, minutes, secs)
  }
  return String(format: "%02d:%02d", minutes, secs)
}

private func runTitle(_ state: RoamRunAttributes.ContentState) -> String {
  state.workoutLabel.isEmpty ? "Free run" : state.workoutLabel
}

/// The run readout as a Lock Screen banner and Dynamic Island (#149).
///
/// This is plain SwiftUI: no JavaScript, no app group. Content arrives through
/// ActivityKit, so the extension renders whatever the app last sent.
struct RoamRunLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RoamRunAttributes.self) { context in
      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 6) {
          Text("ROAM")
            .font(.caption2.weight(.bold))
            .foregroundStyle(.secondary)
          Text(runTitle(context.state))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
          if context.state.state == "paused" {
            Text("Paused")
              .font(.caption2.weight(.bold))
              .foregroundStyle(.secondary)
          }
        }
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(String(format: "%.2f", context.state.distanceKm))
            .font(.system(size: 40, weight: .bold, design: .rounded))
          Text("km")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.secondary)
        }
        HStack(spacing: 4) {
          Text(formatRunDuration(context.state.durationSeconds))
            .font(.system(size: 16, weight: .semibold))
          Text("· \(context.state.paceLabel)")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.secondary)
        }
      }
      .padding(16)
      .widgetURL(URL(string: "roam://run"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(String(format: "%.2f km", context.state.distanceKm))
            .font(.system(size: 20, weight: .bold, design: .rounded))
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(formatRunDuration(context.state.durationSeconds))
            .font(.system(size: 20, weight: .bold, design: .rounded))
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text("\(runTitle(context.state)) · \(context.state.paceLabel)")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      } compactLeading: {
        Image(systemName: context.state.state == "paused" ? "pause.fill" : "figure.run")
      } compactTrailing: {
        Text(String(format: "%.2f", context.state.distanceKm))
          .font(.system(size: 14, weight: .bold))
      } minimal: {
        Image(systemName: context.state.state == "paused" ? "pause.fill" : "figure.run")
      }
      .widgetURL(URL(string: "roam://run"))
    }
  }
}

@main
struct RoamRunLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    RoamRunLiveActivityWidget()
  }
}
