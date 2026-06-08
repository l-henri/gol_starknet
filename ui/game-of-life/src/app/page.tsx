import GameOfLife from '@/components/game-of-life'
import LifeformsPanel from '@/components/lifeforms-panel'

export default function Home() {
  return (
    <main className="min-h-screen">
      <GameOfLife />
      <LifeformsPanel />
    </main>
  )
}
