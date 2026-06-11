import { useState } from 'react'
import KPICards        from '../components/KPICards'
import FilterBar       from '../components/FilterBar'
import LeadsTable      from '../components/LeadsTable'
import FunnelChart     from '../components/charts/FunnelChart'
import BarChart        from '../components/charts/BarChart'
import TrendChart      from '../components/charts/TrendChart'
import DonutChart      from '../components/charts/DonutChart'
import SourceMatrix    from '../components/charts/SourceMatrix'
import SubStepsChart   from '../components/charts/SubStepsChart'
import { useFunnelMetrics }   from '../hooks/useFunnelMetrics'
import { useTrendData }       from '../hooks/useTrendData'
import { useSourceBreakdown } from '../hooks/useSourceBreakdown'
import { useLeadsData }       from '../hooks/useLeadsData'
import { useTagBreakdown }    from '../hooks/useTagBreakdown'

const CHART_VIEWS = [
  { key: 'funnel',   label: '🎯 Funnel'    },
  { key: 'bar',      label: '📊 Bar'       },
  { key: 'trend',    label: '📈 Trend'     },
  { key: 'donut',    label: '🍩 Mix'       },
  { key: 'matrix',   label: '🗂 Matrix'    },
  { key: 'substeps', label: '🏷 Sub-steps' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function DashboardPage() {
  const [chartView, setChartView] = useState('funnel')
  const [filters, setFilters] = useState({
    startDate: '', endDate: '', source: '', stage: '',
  })

  const params = {
    startDate: filters.startDate || undefined,
    endDate:   filters.endDate   || undefined,
    source:    filters.source    || undefined,
  }

  const { data: metrics, loading: metricsLoading }  = useFunnelMetrics(params)
  const { data: trendData, loading: trendLoading }  = useTrendData(params)
  const { data: sourceData }                        = useSourceBreakdown(params)
  const { data: tagData, loading: tagLoading }      = useTagBreakdown({
    ...params,
    stage: filters.stage || undefined,
  })
  const leadsData = useLeadsData({
    ...params,
    stage: filters.stage || undefined,
  })

  const total         = metrics?.total ?? 0
  const revenueCount  = metrics?.revenue ?? 0
  const awareCount    = metrics?.awareness ?? 0
  const overallConv   = awareCount > 0
    ? ((revenueCount / awareCount) * 100).toFixed(1)
    : 0
  const lastUpdated   = metrics?.last_updated

  return (
    <div>
      <div className="page-header">
        <h1>⚓ AAARRR Pirate Metrics</h1>
        <p>Awareness · Acquisition · Activation · Retention · Referral · Revenue</p>
      </div>

      {/* Hero stats */}
      <div className="funnel-hero">
        <div className="funnel-hero-stat">
          <div className="label">Total Leads</div>
          <div className="value">{metricsLoading ? '—' : total.toLocaleString()}</div>
          <div className="sub">All 6 stages</div>
        </div>
        <div className="funnel-hero-stat">
          <div className="label">👀 Awareness</div>
          <div className="value">{metricsLoading ? '—' : awareCount.toLocaleString()}</div>
          <div className="sub">Top of funnel</div>
        </div>
        <div className="funnel-hero-stat">
          <div className="label">🤑 Revenue</div>
          <div className="value">{metricsLoading ? '—' : revenueCount.toLocaleString()}</div>
          <div className="sub">Bottom of funnel</div>
        </div>
        <div className="funnel-hero-stat">
          <div className="label">Overall Conversion</div>
          <div className="value">{metricsLoading ? '—' : `${overallConv}%`}</div>
          <div className="sub">Awareness → Revenue</div>
        </div>
        {lastUpdated && (
          <div className="funnel-hero-stat">
            <div className="label">Last Updated</div>
            <div className="value" style={{ fontSize: 16 }}>{formatDate(lastUpdated)}</div>
            <div className="sub">Most recent lead</div>
          </div>
        )}
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* KPI Cards — 6 across */}
      <KPICards metrics={metrics} loading={metricsLoading} />

      {/* Chart section */}
      <div className="chart-section">
        <div className="chart-section-header">
          <h2 className="chart-section-title">Funnel Visualisation</h2>
          <div className="chart-toggle-group">
            {CHART_VIEWS.map(v => (
              <button
                key={v.key}
                className={`chart-toggle-btn${chartView === v.key ? ' active' : ''}`}
                onClick={() => setChartView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {chartView === 'funnel'   && <FunnelChart   metrics={metrics} />}
        {chartView === 'bar'      && <BarChart       metrics={metrics} />}
        {chartView === 'trend'    && (
          trendLoading
            ? <div className="spinner-wrap"><div className="spinner" /></div>
            : <TrendChart data={trendData} />
        )}
        {chartView === 'donut'    && <DonutChart     metrics={metrics} />}
        {chartView === 'matrix'   && <SourceMatrix   data={sourceData}  />}
        {chartView === 'substeps' && (
          <SubStepsChart data={tagData} loading={tagLoading} />
        )}
      </div>

      {/* Leads table */}
      <LeadsTable
        rows={leadsData.rows}
        total={leadsData.total}
        page={leadsData.page}
        totalPages={leadsData.totalPages}
        setPage={leadsData.setPage}
        loading={leadsData.loading}
      />
    </div>
  )
}
