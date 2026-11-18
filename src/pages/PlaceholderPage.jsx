import EmptyState from '../components/EmptyState.jsx'
import PageHeader from '../components/PageHeader.jsx'

export default function PlaceholderPage({
  title,
  description,
  icon: Icon,
  emptyTitle,
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Icon}
        title={emptyTitle}
        description={`Kerangka halaman ${title.toLowerCase()} sudah tersedia. Data dan aksi bisnis akan dibuat pada tahap implementasi berikutnya.`}
      />
    </>
  )
}
