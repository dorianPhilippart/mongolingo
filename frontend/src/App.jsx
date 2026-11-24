import { useCallback, useEffect, useMemo, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
const STREAK_STORAGE_KEY = 'mongolingo-streak'

function getDayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDayKey(dayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey || '')) return null
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dayDiff(fromDayKey, toDayKey) {
  const from = parseDayKey(fromDayKey)
  const to = parseDayKey(toDayKey)
  if (!from || !to) return null
  const ms = to.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0)
  return Math.round(ms / 86400000)
}

function getUpdatedStreakState(previousState) {
  const today = getDayKey()
  if (!previousState || !previousState.lastActiveDay || !previousState.count) {
    return { count: 1, lastActiveDay: today }
  }

  if (previousState.lastActiveDay === today) {
    return previousState
  }

  const diff = dayDiff(previousState.lastActiveDay, today)
  if (diff === 1) {
    return { count: previousState.count + 1, lastActiveDay: today }
  }

  if (diff && diff > 1) {
    return { count: 1, lastActiveDay: today }
  }

  return previousState
}

function App() {
  const [tab, setTab] = useState('quiz')
  const [questionTypeFilter, setQuestionTypeFilter] = useState('all')
  const [questionStatusFilter, setQuestionStatusFilter] = useState('all')
  const [questionLevelFilter, setQuestionLevelFilter] = useState('all')
  const [questions, setQuestions] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedQuestion, setSelectedQuestion] = useState(null)
  const [answer, setAnswer] = useState('')
  const [selectedOption, setSelectedOption] = useState('')
  const [checkResult, setCheckResult] = useState(null)
  const [runResult, setRunResult] = useState(null)
  const [collections, setCollections] = useState([])
  const [backups, setBackups] = useState([])
  const [status, setStatus] = useState('')
  const [showCollections, setShowCollections] = useState(false)
  const [completedIds, setCompletedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mongolingo-completed') || '[]')
    } catch {
      return []
    }
  })
  const [customSpec, setCustomSpec] = useState(
    JSON.stringify(
      {
        collection: 'users',
        operation: 'find',
        filter: { premium: true },
        projection: { _id: 0, username: 1, country: 1 },
      },
      null,
      2,
    ),
  )
  const [customResult, setCustomResult] = useState(null)
  const [streakCount, setStreakCount] = useState(1)

  const completedCount = completedIds.length
  const totalQuestions = questions.length
  const isCompletedQuestion = completedIds.includes(selectedId)
  const selectedIndex = useMemo(
    () => questions.findIndex((q) => q.id === selectedId),
    [questions, selectedId],
  )
  const hasNextQuestion = selectedIndex >= 0 && selectedIndex < questions.length - 1
  const collectionsByName = useMemo(() => {
    return new Map(collections.map((col) => [col.collectionName, col.schema]))
  }, [collections])
  const progressPercent = useMemo(() => {
    if (totalQuestions === 0) return 0
    return Math.round((completedCount / totalQuestions) * 100)
  }, [completedCount, totalQuestions])
  const availableLevels = useMemo(() => {
    const order = ['simple', 'intermediaire', 'avance', 'expert']
    const levels = [...new Set(questions.map((q) => q.level).filter(Boolean))]
    return levels.sort((a, b) => {
      const ai = order.indexOf(a)
      const bi = order.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }, [questions])
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const typeOk =
        questionTypeFilter === 'all'
          ? true
          : questionTypeFilter === 'mcq'
            ? q.type === 'mcq'
            : q.type !== 'mcq'

      const statusOk =
        questionStatusFilter === 'all'
          ? true
          : questionStatusFilter === 'validated'
            ? completedIds.includes(q.id)
            : !completedIds.includes(q.id)

      const levelOk = questionLevelFilter === 'all' ? true : q.level === questionLevelFilter

      return typeOk && statusOk && levelOk
    })
  }, [questions, questionTypeFilter, questionStatusFilter, questionLevelFilter, completedIds])

  useEffect(() => {
    localStorage.setItem('mongolingo-completed', JSON.stringify(completedIds))
  }, [completedIds])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STREAK_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      const next = getUpdatedStreakState(parsed)
      setStreakCount(next.count)
      localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(next))
    } catch {
      const fallback = { count: 1, lastActiveDay: getDayKey() }
      setStreakCount(1)
      localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(fallback))
    }
  }, [])

  const apiGet = useCallback(async (path) => {
    const response = await fetch(`${API_BASE}${path}`)
    const data = await response.json()
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Erreur API')
    }
    return data
  }, [])

  async function apiPost(path, payload) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    })
    const data = await response.json()
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Erreur API')
    }
    return data
  }

  const loadCoreData = useCallback(async () => {
    try {
      setStatus('Chargement des donnees...')
      const [q, c, b] = await Promise.all([
        apiGet('/api/quiz/questions'),
        apiGet('/api/meta/collections'),
        apiGet('/api/data/backups'),
      ])

      setQuestions(q.questions)
      setCollections(c.collections)
      setBackups(b.backups)
      setStatus('Pret')
    } catch (error) {
      setStatus(`Erreur: ${error.message}`)
    }
  }, [apiGet])

  const loadQuestionDetail = useCallback(async (id) => {
    try {
      const data = await apiGet(`/api/quiz/${id}`)
      setSelectedQuestion(data.question)
      setAnswer('')
      setSelectedOption('')
      setRunResult(null)
      setCheckResult(null)
      setShowCollections(false)
    } catch (error) {
      setStatus(`Erreur question: ${error.message}`)
    }
  }, [apiGet])

  useEffect(() => {
    loadCoreData()
  }, [loadCoreData])

  useEffect(() => {
    if (selectedId) loadQuestionDetail(selectedId)
  }, [loadQuestionDetail, selectedId])

  async function checkAnswer() {
    try {
      const payloadAnswer = selectedQuestion?.type === 'mcq' ? selectedOption : answer
      const data = await apiPost(`/api/quiz/${selectedId}/check`, { answer: payloadAnswer })
      setCheckResult(data)
      if (data.isCorrect) {
        setCompletedIds((prev) => (prev.includes(selectedId) ? prev : [...prev, selectedId]))
      }
    } catch (error) {
      setStatus(`Verification impossible: ${error.message}`)
    }
  }

  async function runSolution() {
    try {
      setStatus('Execution de la solution...')
      const data = await apiPost(`/api/quiz/${selectedId}/run`)
      setRunResult(data)
      setStatus('Execution terminee')
    } catch (error) {
      setStatus(`Execution impossible: ${error.message}`)
    }
  }

  async function runCustomSpec() {
    try {
      const operationSpec = JSON.parse(customSpec)
      const data = await apiPost('/api/query/run', { operationSpec })
      setCustomResult(data.result)
      setStatus('Operation personnalisee executee')
    } catch (error) {
      setStatus(`Operation invalide: ${error.message}`)
    }
  }

  function goToNextQuestion() {
    if (!hasNextQuestion) return
    const nextId = questions[selectedIndex + 1].id
    setSelectedId(nextId)
    setAnswer('')
    setSelectedOption('')
    setCheckResult(null)
    setRunResult(null)
    setShowCollections(false)
  }

  async function resetDemo() {
    try {
      await apiPost('/api/data/reset-demo')
      await loadCoreData()
      setStatus('Donnees demo rechargees')
    } catch (error) {
      setStatus(`Reset impossible: ${error.message}`)
    }
  }

  async function createBackup() {
    try {
      await apiPost('/api/data/backup')
      const updated = await apiGet('/api/data/backups')
      setBackups(updated.backups)
      setStatus('Backup cree')
    } catch (error) {
      setStatus(`Backup impossible: ${error.message}`)
    }
  }

  async function importFile(file, collection, kind, options = {}) {
    const useFileCollection = Boolean(options.useFileCollection)
    if (!file) {
      setStatus('Selectionne un fichier a importer.')
      return
    }

    if (!useFileCollection && !collection) {
      setStatus('Selectionne une collection existante.')
      return
    }

    const formData = new FormData()
    if (collection) {
      formData.append('collection', collection)
    }
    formData.append('useFileCollection', String(useFileCollection))
    formData.append('file', file)

    try {
      const response = await fetch(`${API_BASE}/api/data/import/${kind}`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Import echoue')
      }
      const importedCollection = data.collection || collection
      setStatus(
        `Import ${kind.toUpperCase()} termine (${data.inserted} docs) dans ${importedCollection}.`,
      )
      await loadCoreData()
    } catch (error) {
      setStatus(`Import impossible: ${error.message}`)
    }
  }

  return (
    <main className="app-shell">
      <header className="hero app-mobile-header">
        <div className="mobile-topbar">
          <p className="badge">Mongolingo</p>

          <div className="lesson-progress">
            <div className="lesson-progress-head">
              <strong>Progression</strong>
              <span>{completedCount}/{totalQuestions}</span>
            </div>
            <div
              className="lesson-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <div
                className="lesson-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="mobile-stats" aria-label="Statistiques rapides">
            <span className="stat-chip fire">🔥 Streak {streakCount}</span>
          </div>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`quiz-tab ${tab === 'quiz' ? 'active' : ''}`}
          onClick={() => setTab('quiz')}
        >
          Quiz
        </button>
        <button
          className={`data-tab ${tab === 'data' ? 'active' : ''}`}
          onClick={() => setTab('data')}
        >
          Data Lab
        </button>
      </nav>

      {status && (
        <p className="app-status" role="status">
          {status}
        </p>
      )}

      {tab === 'quiz' && (
        <>
          <section className="grid-quiz">
            <aside className="panel list-panel">
              <h2>Questions ({filteredQuestions.length}/{questions.length})</h2>
              <div className="actions compact filters-bar">
                <button
                  className={questionTypeFilter === 'all' ? 'active' : ''}
                  onClick={() => setQuestionTypeFilter('all')}
                >
                  Toutes
                </button>
                <button
                  className={questionTypeFilter === 'mcq' ? 'active' : ''}
                  onClick={() => setQuestionTypeFilter('mcq')}
                >
                  QCM
                </button>
                <button
                  className={questionTypeFilter === 'query' ? 'active' : ''}
                  onClick={() => setQuestionTypeFilter('query')}
                >
                  Requetes
                </button>
                <select
                  value={questionStatusFilter}
                  onChange={(e) => setQuestionStatusFilter(e.target.value)}
                >
                  <option value="all">Statut: toutes</option>
                  <option value="validated">Statut: validees</option>
                  <option value="pending">Statut: non validees</option>
                </select>
                <select
                  value={questionLevelFilter}
                  onChange={(e) => setQuestionLevelFilter(e.target.value)}
                >
                  <option value="all">Niveau: tous</option>
                  {availableLevels.map((level) => (
                    <option key={level} value={level}>
                      Niveau: {level}
                    </option>
                  ))}
                </select>
              </div>
              <div className="question-list unit-stack">
                {filteredQuestions.map((q, idx) => (
                  <button
                    key={q.id}
                    className={`question ${idx % 2 === 0 ? 'lane-left' : 'lane-right'} ${selectedId === q.id ? 'active' : ''}`}
                    title={`#${q.id} - ${q.title}`}
                    aria-label={`Question ${q.id}: ${q.title}`}
                    onClick={() => setSelectedId(q.id)}
                  >
                    <span>{q.id}</span>
                    <div className="question-copy">
                      <strong>{q.title}</strong>
                      <em>{q.level}</em>
                    </div>
                    <i className={completedIds.includes(q.id) ? 'unit-dot done' : 'unit-dot'} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </aside>

            <article className="panel detail-panel">
              {selectedQuestion ? (
                <>
                  <h2>
                    #{selectedQuestion.id} - {selectedQuestion.title}
                  </h2>
                  <p className="prompt">{selectedQuestion.prompt}</p>
                  <p className="hint">Indice: {selectedQuestion.hint}</p>

                  {selectedQuestion.type === 'mcq' ? (
                    <div className="result run">
                      <h3>Choisis une reponse</h3>
                      {(selectedQuestion.options || []).map((option) => (
                        <label key={`opt-${selectedQuestion.id}-${option.key}`}>
                          <input
                            type="radio"
                            name={`mcq-${selectedQuestion.id}`}
                            value={option.key}
                            checked={selectedOption === option.key}
                            onChange={(e) => setSelectedOption(e.target.value)}
                          />
                          {option.key}. {option.text}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Ecris ta requete MongoDB ici..."
                      rows={6}
                    />
                  )}

                  <div className="actions">
                    <button onClick={checkAnswer}>Verifier ma reponse</button>
                    {selectedQuestion?.solutionMql && selectedQuestion?.runnableInMongolingo !== false && (
                      <button onClick={runSolution}>Executer la solution officielle</button>
                    )}
                    <button onClick={() => setShowCollections((prev) => !prev)}>
                      {showCollections ? 'Masquer les collections' : 'Afficher les collections'}
                    </button>
                  </div>

                  {showCollections && (
                    <div className="result ok">
                      <h3>Collections concernees</h3>
                      {(selectedQuestion.collections || ['non specifiee']).map((name) => {
                        const schema = collectionsByName.get(name)
                        return (
                          <details key={`q-col-${name}`}>
                            <summary className="schema-summary">{name}</summary>
                            {schema ? (
                              <pre>{JSON.stringify(schema, null, 2)}</pre>
                            ) : (
                              <p>Schema indisponible pour cette collection.</p>
                            )}
                          </details>
                        )
                      })}
                    </div>
                  )}

                  {checkResult && (
                    <div className={checkResult.isCorrect ? 'result ok' : 'result ko'}>
                      <h3>{checkResult.isCorrect ? 'Correct' : 'A revoir'}</h3>
                      <p>{checkResult.explanation}</p>
                      <pre>{checkResult.expected}</pre>
                      {checkResult.isCorrect && (
                        <div className="actions compact">
                          {hasNextQuestion ? (
                            <button onClick={goToNextQuestion}>Passer a la question suivante</button>
                          ) : (
                            <p>Bravo, tu as termine la derniere question.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!checkResult && isCompletedQuestion && selectedQuestion?.solutionMql && (
                    <div className="result ok">
                      <h3>Question deja validee</h3>
                      <p>Reponse officielle :</p>
                      <pre>{selectedQuestion.solutionMql}</pre>
                    </div>
                  )}

                  {runResult && (
                    <div className="result run">
                      <h3>Execution sur base MongoDB</h3>
                      <p>{runResult.explanation}</p>
                      <pre>{runResult.query}</pre>
                      <details>
                        <summary>Afficher le resultat JSON</summary>
                        <pre>{JSON.stringify(runResult.result, null, 2)}</pre>
                      </details>
                    </div>
                  )}
                </>
              ) : (
                <p>Selectionne une question pour commencer.</p>
              )}
            </article>

          </section>
        </>
      )}

      {tab === 'data' && (
        <section className="grid-data">
          <article className="panel">
            <h2>Collections et schemas</h2>
            <div className="actions">
              <button onClick={resetDemo}>Recharger les donnees demo</button>
              <button onClick={createBackup}>Creer un backup</button>
            </div>
            <div className="collection-list">
              {collections.map((col) => (
                <div key={col.collectionName} className="collection-item">
                  <h3>{col.collectionName}</h3>
                  <p>Documents: {col.count}</p>
                  <div className="actions compact">
                    <a href={`${API_BASE}/api/data/export/json/${col.collectionName}`}>
                      Export JSON
                    </a>
                    <a href={`${API_BASE}/api/data/export/bson/${col.collectionName}`}>
                      Export BSON
                    </a>
                  </div>
                  <details>
                    <summary className="schema-summary">Voir schema</summary>
                    {col.schema ? (
                      <pre>{JSON.stringify(col.schema, null, 2)}</pre>
                    ) : (
                      <p>Schema indisponible pour cette collection.</p>
                    )}
                  </details>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <h2>Imports</h2>
            <Importer
              label="Import JSON"
              kind="json"
              collections={collections}
              onImport={importFile}
            />
            <Importer
              label="Import BSON"
              kind="bson"
              collections={collections}
              onImport={importFile}
            />

            <h2>Operation personnalisee</h2>
            <textarea
              rows={10}
              value={customSpec}
              onChange={(e) => setCustomSpec(e.target.value)}
            />
            <div className="actions">
              <button onClick={runCustomSpec}>Executer operationSpec</button>
            </div>
            {customResult && (
              <details>
                <summary>Resultat operationSpec</summary>
                <pre>{JSON.stringify(customResult, null, 2)}</pre>
              </details>
            )}
          </article>

          <article className="panel">
            <h2>Backups disponibles</h2>
            {backups.length === 0 ? (
              <p>Aucun backup pour le moment.</p>
            ) : (
              <ul className="backup-list">
                {backups.map((folder) => (
                  <li key={folder}>{folder}</li>
                ))}
              </ul>
            )}
          </article>
        </section>
      )}

    </main>
  )
}

function Importer({ label, kind, collections, onImport }) {
  const [selectedCollection, setSelectedCollection] = useState('')
  const [useFileCollection, setUseFileCollection] = useState(false)
  const [file, setFile] = useState(null)

  return (
    <div className="import-block">
      <h3>{label}</h3>
      <select
        value={selectedCollection}
        onChange={(e) => setSelectedCollection(e.target.value)}
        disabled={useFileCollection}
      >
        <option value="">Selectionner une collection existante</option>
        {collections.map((col) => (
          <option key={col.collectionName} value={col.collectionName}>
            {col.collectionName}
          </option>
        ))}
      </select>
      <label>
        <input
          type="checkbox"
          checked={useFileCollection}
          onChange={(e) => setUseFileCollection(e.target.checked)}
        />
        Creer une nouvelle collection a partir du nom du fichier
      </label>
      <input
        type="file"
        accept={kind === 'json' ? '.json,application/json' : '.bson,application/octet-stream'}
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button
        onClick={() =>
          onImport(file, selectedCollection.trim(), kind, {
            useFileCollection,
          })
        }
      >
        Lancer import {kind.toUpperCase()}
      </button>
    </div>
  )
}

export default App
