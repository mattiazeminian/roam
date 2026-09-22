import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

// The brand, shared with src/theme/colors.ts: near-black ground, lime accent,
// off-white ink. Forced onto the Live Activity so it reads as ROAM on any Lock
// Screen, in either system appearance.
private let brandLime = Color(red: 205.0 / 255.0, green: 242.0 / 255.0, blue: 75.0 / 255.0)
private let brandInk = Color(red: 242.0 / 255.0, green: 243.0 / 255.0, blue: 239.0 / 255.0)
private let brandMuted = Color(red: 169.0 / 255.0, green: 174.0 / 255.0, blue: 164.0 / 255.0)
private let brandGround = Color(red: 14.0 / 255.0, green: 15.0 / 255.0, blue: 12.0 / 255.0)

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
/// Plain SwiftUI: no JavaScript, no app group. The elapsed clock is a system
/// timer anchored to the run's start, so it ticks every second on its own;
/// distance and pace refresh with the app's bounded pushes.
struct RoamRunLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RoamRunAttributes.self) { context in
      let state = context.state
      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 8) {
          Text("ROAM")
            .font(.system(size: 11, weight: .black))
            .tracking(2)
            .foregroundStyle(brandLime)
          Spacer(minLength: 8)
          Text(runTitle(state))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(brandMuted)
          if state.state == "paused" {
            PausedPill()
          }
        }

        HStack(alignment: .firstTextBaseline, spacing: 8) {
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(String(format: "%.2f", state.distanceKm))
              .font(.custom("HelveticaNeue-CondensedBlack", size: 46))
              .foregroundStyle(brandLime)
            Text("km")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(brandMuted)
          }
          Spacer(minLength: 8)
          VStack(alignment: .trailing, spacing: 2) {
            RunClock(state: state)
              .font(.system(size: 24, weight: .semibold, design: .rounded))
              .monospacedDigit()
              .foregroundStyle(brandInk)
            Text(state.paceLabel)
              .font(.system(size: 13, weight: .semibold))
              .monospacedDigit()
              .foregroundStyle(brandMuted)
          }
        }
      }
      .padding(16)
      .activityBackgroundTint(brandGround)
      .widgetURL(URL(string: "roam://run"))
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(String(format: "%.2f km", state.distanceKm))
            .font(.system(size: 22, weight: .black, design: .rounded))
            .foregroundStyle(brandLime)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          RunClock(state: state)
            .font(.system(size: 22, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(brandInk)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 6) {
            Text(runTitle(state))
              .font(.caption.weight(.semibold))
              .foregroundStyle(brandMuted)
            Text("· \(state.paceLabel)")
              .font(.caption.weight(.semibold))
              .monospacedDigit()
              .foregroundStyle(brandMuted)
            if state.state == "paused" {
              PausedPill()
            }
          }
        }
      } compactLeading: {
        Image(systemName: state.state == "paused" ? "pause.fill" : "figure.run")
          .foregroundStyle(brandLime)
      } compactTrailing: {
        RunClock(state: state)
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(brandLime)
      } minimal: {
        Image(systemName: state.state == "paused" ? "pause.fill" : "figure.run")
          .foregroundStyle(brandLime)
      }
      .widgetURL(URL(string: "roam://run"))
    }
  }
}

/// The elapsed clock. While running it is a system timer anchored to the run, so
/// it advances every second by itself; paused, it is a frozen reading.
private struct RunClock: View {
  let state: RoamRunAttributes.ContentState

  var body: some View {
    if state.state == "active" {
      Text(Date(timeIntervalSince1970: state.startedAtMs / 1000.0), style: .timer)
    } else {
      Text(formatRunDuration(state.durationSeconds))
    }
  }
}

private struct PausedPill: View {
  var body: some View {
    Text("PAUSED")
      .font(.system(size: 10, weight: .black))
      .tracking(1)
      .foregroundStyle(brandGround)
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .background(Capsule().fill(brandLime))
  }
}

@main
struct RoamRunLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    RoamRunLiveActivityWidget()
  }
}
