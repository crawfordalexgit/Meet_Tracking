export default function SquadCard({title, status, percent, meets}){
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold">{title}</h4>
          <div className="small-muted">{meets} swimmers</div>
        </div>
        <div className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs">{status}</div>
      </div>

      <div className="mt-4 flex items-end gap-4">
        <div className="flex-1">
          <div className="text-sm small-muted">Overall</div>
          <div className="text-2xl font-bold">{percent}%</div>
        </div>
        <div className="w-20 h-20 bg-gradient-to-br from-tealGlow/40 to-transparent rounded-full flex items-center justify-center">
          <div className="text-sm">Meets</div>
        </div>
      </div>
    </div>
  )
}
