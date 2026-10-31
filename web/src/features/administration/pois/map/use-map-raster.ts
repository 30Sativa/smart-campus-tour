import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../../../api/client'
import { technicalApi, type MapVersionItem } from '../../../technical/api/technical'
import { errorText } from '../../../technical/technical-format'
import { useMapVersions } from '../../../technical/technical-hooks'
import type { OccupancyMap } from './catalog'
import { parseVersionedMapPackage, rasterPngBlob } from './versioned-package'

export type MapRasterState = { map: OccupancyMap | null; error: string | null; retry: () => void }

/** A data URL lives in the shared cache as plain text, so no screen owns an object URL to revoke. */
function pngDataUrl(png: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Không thể tạo ảnh xem trước map.'))
    reader.readAsDataURL(png)
  })
}

async function loadRaster({ id, mapKey, frameId, imageFileName, packageSha256 }: MapVersionItem['map']): Promise<OccupancyMap> {
  const bytes = await technicalApi.getMapPackage(id)
  const raster = await parseVersionedMapPackage(await bytes.arrayBuffer(), imageFileName)
  const imageUrl = await pngDataUrl(await rasterPngBlob(raster))
  return { schemaVersion: 1, mapKey, frameId, imageUrl, imageSha256: raster.imageSha256, fingerprint: packageSha256,
    sourceYaml: raster.sourceYaml, width: raster.width, height: raster.height, resolution: raster.resolution, origin: raster.origin }
}

function failureText(cause: unknown) {
  const text = errorText(cause)
  return cause instanceof ApiError && text === cause.message ? 'Máy chủ không trả về được bản đồ này.' : text
}

/**
 * The raster of one uploaded map version. A package never changes after upload,
 * so one download serves every screen that shows it.
 */
export function useMapRaster(mapVersionId: string | null | undefined): MapRasterState {
  const id = mapVersionId || null
  const versions = useMapVersions()
  const listed = versions.data?.find(item => item.map.id === id)
  // A proposal can sit on a version the list no longer returns.
  const details = useQuery({
    queryKey: ['technical', 'map', id],
    queryFn: () => technicalApi.getMap(id!),
    enabled: Boolean(id) && !listed && !versions.isPending,
  })
  const version = (listed ?? details.data)?.map
  const raster = useQuery({
    queryKey: ['technical', 'map-raster', id],
    queryFn: () => loadRaster(version!),
    enabled: Boolean(version),
    staleTime: Infinity,
    retry: false,
  })

  const failure = raster.error ?? (listed ? null : details.error)
  const fetching = raster.isFetching || details.isFetching
  return {
    map: raster.data ?? null,
    error: failure && !fetching ? failureText(failure) : null,
    retry: () => void (raster.error ? raster.refetch() : details.refetch()),
  }
}
