import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Mic, Send, UserRound } from 'lucide-react'
import type { AssistantAnswer } from '../../api/contracts/visitor'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { RobotMark } from '../../features/visitor/components/RobotMark'
import { useAskAssistant, useCampusLocations } from '../../features/visitor/visitor-hooks'
import { SUGGESTED_QUESTIONS } from '../../features/visitor/visitor-content'

/**
 * The campus assistant.
 *
 * A plain chat column on this surface's own card, with the surface's own input:
 * the composer is `.auth-input` and the send button is `.lp-btn--solid`, so the
 * screen is made of the same parts as the sign-in form and the landing page's
 * calls to action, not of a chat widget's parts.
 *
 * When the assistant names places, they come back as location ids and this page
 * turns them into cards with "Show on map" and "Take me there" — the same two
 * actions Explore offers, so a suggestion is as actionable as a search result.
 *
 * The transcript is component state on purpose: it is a conversation, not server
 * data, and it is gone on reload, which is the honest behaviour while there is no
 * endpoint storing it.
 */
type Turn =
  | { id: string; who: 'me'; text: string }
  | { id: string; who: 'bot'; text: string; locationIds: string[] }

const OPENING: Turn = {
  id: 'opening',
  who: 'bot',
  text: 'Hello. Ask me anything about the campus and I will point you to it. You can also ask me to take you there.',
  locationIds: [],
}

export default function AskRobotPage() {
  const [turns, setTurns] = useState<Turn[]>([OPENING])
  const [draft, setDraft] = useState('')
  const ask = useAskAssistant()
  const locations = useCampusLocations()
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript) return
    transcript.scrollTo({ top: transcript.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [turns, ask.isPending])

  const send = (question: string) => {
    const text = question.trim()
    if (!text || ask.isPending) return
    setDraft('')
    setTurns((current) => [...current, { id: `me-${Date.now()}`, who: 'me', text }])
    ask.mutate(text, {
      onSuccess: (answer: AssistantAnswer) =>
        setTurns((current) => [...current, { id: answer.id, who: 'bot', text: answer.text, locationIds: answer.locationIds }]),
      onError: () =>
        setTurns((current) => [
          ...current,
          {
            id: `error-${Date.now()}`,
            who: 'bot',
            text: 'I could not reach the campus assistant just now. Please try again in a moment.',
            locationIds: [],
          },
        ]),
    })
  }

  return (
    <div className="vs-page vs-stack vs-assistant-page">
      <PageHeader
        eyebrow="Ask the robot"
        title="Campus assistant"
        description="Ask about buildings, classes, food or anything else on campus. The robot answers in plain language and can walk you there."
      />

      <div className="vs-card vs-assistant">
        <div className="vs-assistant__head"><span className="vs-choice__icon"><RobotMark size={24} /></span><div><h2 className="vs-h3">Your campus companion</h2><p className="vs-card__meta">Find a place. Plan your next stop.</p></div></div>
        <div className="vs-chat" ref={transcriptRef} role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation with the campus assistant">
          {turns.map((turn) => (
            <div key={turn.id} className={`vs-turn vs-turn--${turn.who}`}>
              <span className="vs-turn__mark" aria-hidden="true">
                {turn.who === 'bot' ? <RobotMark size={19} /> : <UserRound size={16} strokeWidth={2} />}
              </span>
              <div className="vs-min">
                <div className="vs-bubble">
                  <p>{turn.text}</p>
                </div>

                {turn.who === 'bot' && turn.locationIds.length > 0 && (
                  <div className="vs-grid vs-grid--2" style={{ marginTop: 12, gap: 12 }}>
                    {turn.locationIds
                      .map((id) => locations.data?.find((item) => item.id === id))
                      .filter((item) => item != null)
                      .map((location) => (
                        <article key={location.id} className="vs-card vs-card--pad" style={{ padding: 14 }}>
                          <img src={location.imageUrl} alt="" loading="lazy" className="vs-chat-place-image" />
                          <h3 className="vs-card__title" style={{ fontSize: '0.9375rem' }}>
                            {location.name}
                          </h3>
                          <p className="vs-card__meta">
                            {location.building}
                            {location.walkMinutes != null ? ` · ${location.walkMinutes} min walk` : ''}
                          </p>
                          <div className="vs-card__foot" style={{ paddingTop: 12 }}>
                            <Link to={`/visit/map?destination=${location.id}`} className="lp-btn lp-btn--ghost lp-btn--sm">
                              Show on map
                            </Link>
                            <Link to={`/visit/book?destination=${location.id}`} className="lp-btn lp-btn--solid lp-btn--sm">
                              Take me there
                            </Link>
                          </div>
                        </article>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {ask.isPending && (
            <div className="vs-turn vs-turn--bot">
              <span className="vs-turn__mark" aria-hidden="true">
                <RobotMark size={19} />
              </span>
              <div className="vs-bubble" role="status" aria-label="The robot is answering">
                <span className="vs-sr">The robot is answering</span>
                <span className="vs-typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          )}

        </div>

        {turns.length <= 1 && (
          <div className="vs-pills vs-suggestions" role="group" aria-label="Suggested questions">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button key={question} type="button" className="vs-pill" onClick={() => send(question)}>
                {question}
              </button>
            ))}
          </div>
        )}

        <form
          className="vs-composer"
          onSubmit={(event) => {
            event.preventDefault()
            send(draft)
          }}
        >
          <label htmlFor="assistant-input" className="auth-label vs-sr">
            Ask about the campus
          </label>
          <input
            id="assistant-input"
            className="auth-input"
            placeholder="Ask about the campus..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoComplete="off"
            disabled={ask.isPending}
            maxLength={2000}
          />
          {/* Voice input needs a microphone permission flow and a speech endpoint,
              neither of which exists yet. The control is here because the design
              calls for it, and it says what it is rather than failing silently. */}
          <button type="button" className="lp-btn lp-btn--ghost lp-btn--sm" disabled title="Voice input arrives with the speech service">
            <Mic size={16} strokeWidth={2} aria-hidden="true" />
            <span className="vs-sr">Voice</span>
          </button>
          <button type="submit" className="lp-btn lp-btn--solid lp-btn--sm" disabled={!draft.trim() || ask.isPending}>
            <Send size={16} strokeWidth={2} aria-hidden="true" />
            Send
          </button>
        </form>
        <p className="vs-assistant__hint">Voice input is not available yet. Type a question to get started.</p>
      </div>
    </div>
  )
}
