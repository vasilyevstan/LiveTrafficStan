import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DisplayTrain } from '../domain/trains'
import { TrainContext } from './TrainContext'

const train = (index: number): DisplayTrain => ({
  id: `train:entur:${index}`,
  sourceId: 'entur',
  name: `R${index}`,
  category: index === 0 ? 'freight' : 'passenger',
  destination: index === 0 ? undefined : 'Oslo S',
  longitude: 10.75,
  latitude: 59.91,
  observedAt: 100_000,
  freshness: index === 0 ? 'stale' : 'current',
})

describe('TrainContext', () => {
  it('lists source, category, age, staleness, and selection', () => {
    const html = renderToStaticMarkup(
      <TrainContext trains={[train(0), train(1)]} selectedTrainId={train(0).id}
        emptyMessage="None" resultLimit={20} now={160_000} onSelect={() => undefined} />,
    )
    expect(html).toContain('2 trains')
    expect(html).toContain('R1 → Oslo S')
    expect(html).toContain('Freight · Entur · 1 min ago · stale')
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('First')
  })

  it('bounds results and shows a truthful empty message', () => {
    const many = Array.from({ length: 3 }, (_, index) => train(index + 1))
    const bounded = renderToStaticMarkup(
      <TrainContext trains={many} selectedTrainId={null} emptyMessage="None"
        resultLimit={2} now={100_000} onSelect={() => undefined} />,
    )
    expect(bounded.match(/<li>/g)).toHaveLength(2)
    expect(bounded).toContain('First 2 of 3 shown.')
    expect(renderToStaticMarkup(
      <TrainContext trains={[]} selectedTrainId={null}
        emptyMessage="No trains reported in this view." resultLimit={2}
        now={100_000} onSelect={() => undefined} />,
    )).toContain('No trains reported in this view.')
  })
})
