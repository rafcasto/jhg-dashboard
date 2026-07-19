import { supabase } from '../supabase'

/**
 * Columns included in every lead CSV export, in order.
 * `format` massages a raw value into its CSV cell.
 */
export const EXPORT_COLUMNS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name',  label: 'Last Name'  },
  { key: 'email',      label: 'Email'      },
  { key: 'stage',      label: 'Stage'      },
  { key: 'tag',        label: 'Tag'        },
  { key: 'source',     label: 'Source'     },
  { key: 'location',   label: 'Location'   },
  { key: 'score',      label: 'Score'      },
  { key: 'archetype',  label: 'Archetype'  },
  {
    key: 'created_at',
    label: 'Added',
    format: v => (v ? new Date(v).toISOString() : ''),
  },
]

/**
 * Fetch the full list of leads for a funnel stage (default or custom).
 *
 * @param {object}   params
 * @param {string}   [params.stage]        default-funnel stage key
 * @param {string}   [params.source]       source filter
 * @param {string}   [params.startDate]    ISO date (inclusive)
 * @param {string}   [params.endDate]      ISO date (inclusive)
 * @param {string[]} [params.tags]         custom-stage tag set
 * @param {boolean}  [params.uniqueByEmail=true]  dedupe to one row per person
 * @returns {Promise<object[]>} lead rows
 */
export async function fetchLeadsForExport({
  stage,
  source,
  startDate,
  endDate,
  tags,
  uniqueByEmail = true,
} = {}) {
  const { data, error } = await supabase.rpc('get_leads_export', {
    p_stage:           stage     || null,
    p_source:          source    || null,
    p_start:           startDate || null,
    p_end:             endDate   || null,
    p_tags:            tags && tags.length ? tags : null,
    p_unique_by_email: uniqueByEmail,
  })

  if (error) throw new Error(error.message)
  return data ?? []
}
