import ActivityKit

/**
 * The Live Activity for a run in progress (#149).
 *
 * This is the widget extension's copy of the struct. The app's copy lives in
 * `modules/roam-live-activity/ios/RoamRunAttributes.swift`. ActivityKit matches
 * the app's activity to this extension's `ActivityConfiguration` by the
 * attributes type name, so the two definitions must stay identical — change
 * both together.
 */
public struct RoamRunAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var distanceKm: Double
    public var durationSeconds: Int
    public var paceLabel: String
    public var state: String
    public var workoutLabel: String

    public init(
      distanceKm: Double,
      durationSeconds: Int,
      paceLabel: String,
      state: String,
      workoutLabel: String
    ) {
      self.distanceKm = distanceKm
      self.durationSeconds = durationSeconds
      self.paceLabel = paceLabel
      self.state = state
      self.workoutLabel = workoutLabel
    }
  }

  public init() {}
}
