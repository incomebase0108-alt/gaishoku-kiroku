import { useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { History } from './screens/History'
import { Invite } from './screens/Invite'
import { Home } from './screens/Home'
import { RecordForm } from './screens/RecordForm'
import { RecordPick } from './screens/RecordPick'
import { RestaurantDetail } from './screens/RestaurantDetail'
import { RestaurantEdit } from './screens/RestaurantEdit'
import { Search } from './screens/Search'
import { Settings } from './screens/Settings'
import { SharedStore } from './screens/SharedStore'
import { VisitDetail } from './screens/VisitDetail'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Shell() {
  const { pathname } = useLocation()
  // 入力中はタブを隠して、保存ボタンを親指の位置に置く
  const inForm = pathname === '/record/form'
  return (
    <div className="app">
      <ScrollTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/record" element={<RecordPick />} />
        <Route path="/record/form" element={<RecordForm />} />
        <Route path="/restaurant/:id" element={<RestaurantDetail />} />
        <Route path="/restaurant/:id/edit" element={<RestaurantEdit />} />
        <Route path="/visit/:id" element={<VisitDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/search" element={<Search />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/shared" element={<SharedStore />} />
        <Route path="/invite" element={<Invite />} />
        <Route path="*" element={<Home />} />
      </Routes>
      {!inForm && <TabBar />}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
