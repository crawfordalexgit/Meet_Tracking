import {Line} from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

export default function Chart(){
  const data = {
    labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul'],
    datasets: [{
      label: 'WA Points',
      data: [120,180,240,200,260,300,380],
      fill: true,
      backgroundColor: 'rgba(13,199,193,0.12)',
      borderColor: '#0dc7c1',
      tension: 0.4
    }]
  }
  const options = {responsive:true, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}}, y:{grid:{color:'rgba(255,255,255,0.04)'}}}
  return (
    <div style={{height:260}}>
      <Line data={data} options={options} />
    </div>
  )
}
