/// The three sub-stages of a day. Engine: `src/engine/types.ts` `DayStage`.
///
/// Since v2 the day is a trial, not a timed secret ballot: free talk, then a
/// trial with a defense, then the verdict. Transitions are event driven — the
/// server moves to `trial` once an accusation is seconded, and to `verdict`
/// when the defense closes or the headman calls the vote.
enum DayStage { free, trial, verdict }

extension DayStageX on DayStage {
  static DayStage fromWire(String s) => switch (s) {
        'trial' => DayStage.trial,
        'verdict' => DayStage.verdict,
        _ => DayStage.free,
      };

  String get wire => switch (this) {
        DayStage.free => 'free',
        DayStage.trial => 'trial',
        DayStage.verdict => 'verdict',
      };

  /// Whether someone stands accused at the center of the square. The square
  /// widget lays itself out around this.
  bool get hasAccused => this != DayStage.free;
}
