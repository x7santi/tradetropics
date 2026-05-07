import Layout from '@renderer/components/Layout'

export default function StubPage({ title }: { title: string }): JSX.Element {
  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-400 text-sm">{title} — coming soon</p>
      </div>
    </Layout>
  )
}
