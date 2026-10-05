import { marginalTime, type Transcript } from './transcriberModel'

export interface TranscriptViewProps {
  transcript: Transcript | null
  /**
   * The cue number under the playhead, read off the audio element's own
   * `currentTime`. Null when nothing is playing.
   */
  activeCue: number | null
}

/**
 * The transcript, set as it will be read.
 *
 * Cue numbers and timecodes sit in a real margin column the way a critical
 * edition numbers its lines, and the cue the audio is inside takes the accent.
 * That is the only thing on the page that changes while audio plays, and it
 * changes because the element reported a time, not on a timer.
 */
export default function TranscriptView({ transcript, activeCue }: TranscriptViewProps) {
  if (!transcript) return null

  if (transcript.kind === 'cues') {
    return (
      <article className="tc-doc" aria-label="Transcript">
        {transcript.cues.map((cue) => (
          <div
            className="tc-cue"
            key={cue.number}
            data-playing={cue.number === activeCue ? 'true' : 'false'}
          >
            <div className="tc-cue__margin" aria-hidden="true">
              <span className="tc-cue__num ap-mono">{cue.number}</span>
              <span className="tc-cue__time ap-mono">{marginalTime(cue.start)}</span>
            </div>
            <p className="tc-cue__text">{cue.text}</p>
          </div>
        ))}
      </article>
    )
  }

  if (transcript.kind === 'lines') {
    return (
      <article className="tc-doc" aria-label="Transcript">
        {transcript.lines.map((line, position) => (
          <div className="tc-cue" key={`${position}-${line.at}`}>
            <div className="tc-cue__margin" aria-hidden="true">
              <span className="tc-cue__time ap-mono">{line.at}</span>
            </div>
            <p className="tc-cue__text">{line.text}</p>
          </div>
        ))}
      </article>
    )
  }

  return (
    <article className="tc-doc tc-doc--prose" aria-label="Transcript">
      {transcript.paragraphs.map((paragraph, position) => (
        <p className="tc-cue__text" key={position}>
          {paragraph}
        </p>
      ))}
    </article>
  )
}
