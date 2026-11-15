import { ApiError } from '@/lib/api'
import * as api from '../api'
import type { SyncReply } from '../types'
import { isNetworkError, type OpOutcome, type OpRunner } from './queue'

/**
 * Envia um registro da fila ao servidor e traduz a resposta.
 *
 *   APPLIED / DUPLICATE  o servidor tem o registro: sai da fila
 *   CONFLICT             o servidor guardou (ou recusou) por contradizer o
 *                        estado atual: fica visível para o entregador
 *   erro de rede         volta a tentar depois, na mesma ordem
 *   recusa do banco      falha definitiva, visível e reenviável
 */

/** Recusas deliberadas do banco ou da API têm código; queda de rede e de serviço, não. */
export function classifyError(error: unknown): OpOutcome {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error)
  const code = error instanceof ApiError ? error.code ?? '' : ''
  if (isNetworkError(error)) return { kind: 'offline', message }
  // sessão expirada se resolve sozinha quando o token é renovado
  if (code === 'PGRST301' || code === 'HTTP401' || /jwt|token is expired/i.test(message)) {
    return { kind: 'offline', message }
  }
  // disputa de trava no banco (duas ações ao mesmo tempo): repetir resolve
  if (code === '40001' || code === '40P01' || code === '55P03' || code === '57014') return { kind: 'offline', message }
  if (/^[0-9A-Z]{5}$/.test(code) || /^PGRST/.test(code) || /^HTTP4\d\d$/.test(code)) {
    return { kind: 'failed', message }
  }
  return { kind: 'offline', message }
}

function fromReply(reply: SyncReply & { sync_status?: string }): OpOutcome {
  if (reply.status === 'CONFLICT') return { kind: 'conflict', reason: reply.reason ?? 'CONFLICT' }
  // reenvio de um registro que o servidor já tinha guardado como conflito
  if (reply.status === 'DUPLICATE' && reply.sync_status === 'CONFLICT') {
    return { kind: 'conflict', reason: reply.reason ?? 'CONFLICT' }
  }
  return { kind: 'done' }
}

export const runOperation: OpRunner = async (op, store) => {
  try {
    switch (op.type) {
      case 'START_ROUTE':
        return fromReply(await api.startRoute(op.routeId, op.occurredAt))

      case 'ATTEMPT':
        return fromReply(await api.registerDeliveryAttempt({
          attemptId: op.attemptId, packageId: op.packageId, outcome: op.outcome,
          failureReason: op.failureReason, notes: op.notes, recipientName: op.recipientName,
          recipientDocument: op.recipientDocument, latitude: op.latitude, longitude: op.longitude,
          occurredAt: op.occurredAt,
        }))

      case 'PROOF': {
        const file = await store.getBlob(op.blobKey)
        if (!file) return { kind: 'failed', message: 'O arquivo do comprovante não está mais neste aparelho.' }
        await api.uploadProofFile(op.storagePath, file, op.mimeType)
        let conflict: string | null = null
        for (const proof of op.proofs) {
          const reply = await api.addDeliveryProof({
            proofId: proof.proofId, attemptId: proof.attemptId, storagePath: op.storagePath,
            mimeType: op.mimeType, sizeBytes: op.sizeBytes,
          })
          if (reply.status === 'CONFLICT') conflict = reply.reason ?? 'CONFLICT'
        }
        return conflict ? { kind: 'conflict', reason: conflict } : { kind: 'done' }
      }

      case 'SCAN':
        // qualquer resultado de leitura (inclusive "pacote de outro responsável") fica registrado
        return fromReply(await api.registerPackageScan({
          scanId: op.scanId, code: op.code, scanType: op.scanType, manifestId: op.manifestId,
          occurredAt: op.occurredAt,
        }))

      case 'DEPART':
        return fromReply(await api.departManifest(op.manifestId, op.occurredAt))

      case 'REORDER':
        return fromReply(await api.reorderRouteStops(op.routeId, op.stopIds))
    }
  } catch (error) {
    const outcome = classifyError(error)
    // a ordem foi definida sobre um roteiro que mudou (transferido, parada resolvida):
    // não há o que reenviar, o entregador só precisa saber que ela não valeu
    if (op.type === 'REORDER' && outcome.kind === 'failed') return { kind: 'conflict', reason: 'ROUTE_CHANGED' }
    return outcome
  }
}

/** Chamada leve para saber se o servidor está acessível. */
export async function probeServer(): Promise<boolean> {
  try {
    await api.riderConfig()
    return true
  } catch {
    return false
  }
}
