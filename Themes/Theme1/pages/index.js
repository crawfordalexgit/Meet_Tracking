import Head from 'next/head'
import Header from '../components/Header'
import KpiCard from '../components/KpiCard'
import Chart from '../components/Chart'
import SquadCard from '../components/SquadCard'

export default function Home(){
  return (
    <div className="app-shell">
      <Head>
        <title>CoachesEye Theme Demo</title>
        <meta name="description" content="Theme demo"
        />
      </Head>

      <Header />

      <main className="mt-8">
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card lg:col-span-2">
            <h3 className="small-muted">Club Performance Trend</h3>
            <Chart />
          </div>

          <div className="card">
            <div className="grid grid-cols-2 gap-4">
              <KpiCard title="Active Athletes" value="309" />
              <KpiCard title="Season PBs" value="1364" />
              <KpiCard title="Open Meets" value="53" />
              <KpiCard title="Avg Compliance" value="22%" />
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <SquadCard title="Age Development" status="Critical" percent={8} meets={86} />
          <SquadCard title="Gold Development" status="Critical" percent={0} meets={68} />
          <SquadCard title="NAR" status="Critical" percent={28} meets={66} />
        </section>
      </main>
    </div>
  )
}
