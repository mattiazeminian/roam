import ActivityKit
import ExpoModulesCore

/**
 * The ActivityKit bridge for the run Live Activity (#149).
 *
 * Only starts, updates and ends activities — it owns no run state. The run
 * engine is the single source of truth; this just reflects it. Every call is a
 * no-op on a device where Live Activities are unsupported or disabled.
 */
public class RoamLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RoamLiveActivity")

    Function("start") {
      (distanceKm: Double, durationSeconds: Int, paceLabel: String, state: String, workoutLabel: String) -> String? in
      guard #available(iOS 16.1, *) else {
        return nil
      }
      let contentState = RoamRunAttributes.ContentState(
        distanceKm: distanceKm,
        durationSeconds: durationSeconds,
        paceLabel: paceLabel,
        state: state,
        workoutLabel: workoutLabel
      )
      let content = ActivityContent(state: contentState, staleDate: nil)
      do {
        let activity = try Activity<RoamRunAttributes>.request(
          attributes: RoamRunAttributes(),
          content: content,
          pushType: nil
        )
        return activity.id
      } catch {
        return nil
      }
    }

    AsyncFunction("update") {
      (id: String, distanceKm: Double, durationSeconds: Int, paceLabel: String, state: String, workoutLabel: String) in
      guard #available(iOS 16.1, *) else {
        return
      }
      guard let activity = Activity<RoamRunAttributes>.activities.first(where: { $0.id == id }) else {
        return
      }
      let contentState = RoamRunAttributes.ContentState(
        distanceKm: distanceKm,
        durationSeconds: durationSeconds,
        paceLabel: paceLabel,
        state: state,
        workoutLabel: workoutLabel
      )
      await activity.update(ActivityContent(state: contentState, staleDate: nil))
    }

    AsyncFunction("end") { (id: String) in
      guard #available(iOS 16.1, *) else {
        return
      }
      guard let activity = Activity<RoamRunAttributes>.activities.first(where: { $0.id == id }) else {
        return
      }
      await activity.end(nil, dismissalPolicy: .immediate)
    }

    AsyncFunction("endAll") {
      guard #available(iOS 16.1, *) else {
        return
      }
      for activity in Activity<RoamRunAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
