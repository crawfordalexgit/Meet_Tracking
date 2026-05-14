export default function KpiCard({title, value}){
  return (
    <div className="card">
      <div className="text-slate-300 text-sm">{title}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  )
}
