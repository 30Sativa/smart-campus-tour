import { createBrowserRouter } from 'react-router'
import { DigitalTwinCanvas } from '../../three/DigitalTwinCanvas'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DigitalTwinCanvas />,
  },
])