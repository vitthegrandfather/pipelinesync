type SearchableLead = {
  public_id: string;
  first_name: string;
  last_name: string;
  company: string;
  status: string;
};

export function filterLeads<T extends SearchableLead>(rows: T[], q: string, status: string): T[] {
  const query = q.trim().toLowerCase();
  return rows.filter((row) => {
    if (status && row.status !== status) return false;
    if (!query) return true;
    return `${row.public_id} ${row.first_name} ${row.last_name} ${row.company}`.toLowerCase().includes(query);
  });
}
