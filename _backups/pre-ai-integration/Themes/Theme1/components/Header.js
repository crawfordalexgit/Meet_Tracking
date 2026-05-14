export default function Header(){
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <img src="/logo.svg" alt="logo" width={68} height={68} />
        <div>
          <h1 className="text-2xl font-semibold">CoachesEye</h1>
          <div className="small-muted">Design & data consistency assured</div>
        </div>
      </div>
      <div className="flex gap-4">
        <div className="card kpi">
          <div className="text-2xl font-bold">309</div>
          <div className="small-muted">Active Athletes</div>
        </div>
        <div className="card kpi">
          <div className="text-2xl font-bold">1364</div>
          <div className="small-muted">Season PBs</div>
        </div>
      </div>
    </header>
  )
}
