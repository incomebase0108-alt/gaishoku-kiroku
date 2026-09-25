import { NavLink } from 'react-router-dom'
import { IconGear, IconHome, IconList, IconPlus, IconSearch } from './icons'

export function TabBar() {
  const cls = ({ isActive }: { isActive: boolean }) => `tab${isActive ? ' active' : ''}`
  return (
    <nav className="tabbar" aria-label="メニュー">
      <div className="tabbar-in">
        <NavLink to="/" end className={cls}>
          <IconHome />
          ホーム
        </NavLink>
        <NavLink to="/search" className={cls}>
          <IconSearch />
          探す
        </NavLink>
        <NavLink to="/record" className="tab rec" aria-label="今日の食事を記録">
          <span className="circle">
            <IconPlus />
          </span>
          <small>記録</small>
        </NavLink>
        <NavLink to="/history" className={cls}>
          <IconList />
          履歴
        </NavLink>
        <NavLink to="/settings" className={cls}>
          <IconGear />
          設定
        </NavLink>
      </div>
    </nav>
  )
}
