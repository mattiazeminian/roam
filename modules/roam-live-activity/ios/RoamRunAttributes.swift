import ActivityKit

/**
 * The Live Activity for a run in progress (#149).
 *
 * A copy of the same struct lives in the widget extension
 * (`targets/roam-live-activity/RoamRunAttributes.swift`). ActivityKit matches
 * the app's activity to the widget's `ActivityConfiguration` by the attributes
 * type name, so the two definitions must stay identical — change both together.
 */
public struct RoamRunAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var distanceKm: Double
    public var durationSeconds: Int
    /**
     * The anchor for the live clock: `Date.now() - durationSeconds`, computed by
     * the app on each push. The widget renders an elapsed timer from it, so the
     * clock ticks every second without a per-second update.
     */
    public var startedAtMs: Double
    public var paceLabel: String
    public var state: String
    public var workoutLabel: String

    public init(
      distanceKm: Double,
      durationSeconds: Int,
      startedAtMs: Double,
      paceLabel: String,
      state: String,
      workoutLabel: String
    ) {
      self.distanceKm = distanceKm
      self.durationSeconds = durationSeconds
      self.startedAtMs = startedAtMs
      self.paceLabel = paceLabel
      self.state = state
      self.workoutLabel = workoutLabel
    }
  }

  public init() {}
}
