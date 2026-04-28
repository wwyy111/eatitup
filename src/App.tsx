import { useState, useEffect } from 'react'
import FloatingButton from './FloatingButton'
import MainWindow from './MainWindow'

function App() {
  const [route, setRoute] = useState(() => {
    // 根据URL hash决定显示哪个组件
    const hash = window.location.hash
    if (hash === '#/floating') {
      return 'floating'
    }
    return 'main'
  })

  useEffect(() => {
    // 监听hash变化
    const handleHashChange = () => {
      const hash = window.location.hash
      setRoute(hash === '#/floating' ? 'floating' : 'main')
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (route === 'floating') {
    return <FloatingButton />
  }

  return <MainWindow />
}

export default App