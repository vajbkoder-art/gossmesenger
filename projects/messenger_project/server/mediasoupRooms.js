/**
 * SFU (mediasoup): А создаёт комнату при звонке, Б к ней подключается, медиа идут через сервер.
 * С другой сети не работает = не открыты порты медиа. Нужно открыть UDP+TCP 10000-10100
 * в фаерволе VPS (DigitalOcean → Networking → Firewall → Inbound: 10000-10100 TCP и UDP).
 */
import * as mediasoup from 'mediasoup';

const rtcMin = parseInt(process.env.MEDIASOUP_RTC_MIN_PORT || '10000', 10);
const rtcMax = parseInt(process.env.MEDIASOUP_RTC_MAX_PORT || '10100', 10);
const MEDIASOUP_WORKER_SETTINGS = {
  logLevel: 'warn',
  logTags: ['error', 'warn'],
  rtcMinPort: rtcMin,
  rtcMaxPort: rtcMax,
};

let worker = null;
const rooms = new Map(); // roomId -> { router, peers: { peerId: { sendTransport, recvTransport, producers: {} } } }
const peerIdBySocketId = new Map(); // socketId -> { roomId, peerId }

export async function runMediasoupWorker() {
  if (worker) return worker;
  worker = await mediasoup.createWorker(MEDIASOUP_WORKER_SETTINGS);
  worker.on('died', () => {
    console.error('[mediasoup] Worker died');
    process.exit(1);
  });
  console.log('[mediasoup] Worker started');
  return worker;
}

function getAnnouncedIp() {
  return process.env.MEDIASOUP_ANNOUNCED_IP || process.env.PUBLIC_IP || '165.232.69.82';
}

function getListenIps() {
  const primary = getAnnouncedIp();
  const extra = (process.env.MEDIASOUP_ANNOUNCED_IP2 || '109.120.152.22').trim();
  const ips = [{ ip: '0.0.0.0', announcedIp: primary }];
  if (extra && extra !== primary) {
    ips.push({ ip: '0.0.0.0', announcedIp: extra });
  }
  return ips;
}

export async function getOrCreateRoom(roomId) {
  if (rooms.has(roomId)) return rooms.get(roomId);
  const w = await runMediasoupWorker();
  const router = await w.createRouter({
    mediaCodecs: [
      { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
      { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
      { kind: 'video', mimeType: 'video/H264', clockRate: 90000, parameters: { 'packetization-mode': 1 } },
    ],
  });
  const room = { router, peers: {} };
  rooms.set(roomId, room);
  router.observer.on('close', () => rooms.delete(roomId));
  return room;
}

export async function getRouterRtpCapabilities(roomId) {
  const room = await getOrCreateRoom(roomId);
  return room.router.rtpCapabilities;
}

export async function createWebRtcTransport(roomId, peerId, direction) {
  const room = await getOrCreateRoom(roomId);
  const listenIps = getListenIps();
  const useTcpOnly = process.env.MEDIASOUP_TCP_ONLY === '1';
  const transport = await room.router.createWebRtcTransport({
    listenIps,
    enableUdp: !useTcpOnly,
    enableTcp: true,
    preferUdp: false,
    preferTcp: true,
    iceConsentTimeout: 120,
  });
  const port = transport.tuple ? transport.tuple.localPort : '?';
  console.log(`[mediasoup] transport ${direction} peer=${peerId} port=${port} announcedIps=${listenIps.map(i=>i.announcedIp).join(',')}`);
  if (!room.peers[peerId]) room.peers[peerId] = { sendTransport: null, recvTransport: null, producers: {} };
  if (direction === 'send') {
    if (room.peers[peerId].sendTransport) {
      try { room.peers[peerId].sendTransport.close(); } catch(_) {}
      for (const [pid, prod] of Object.entries(room.peers[peerId].producers || {})) {
        try { prod.close(); } catch(_) {}
      }
      room.peers[peerId].producers = {};
      console.log(`[mediasoup] closed old sendTransport for peer=${peerId}`);
    }
    room.peers[peerId].sendTransport = transport;
  } else {
    if (room.peers[peerId].recvTransport) {
      try { room.peers[peerId].recvTransport.close(); } catch(_) {}
      console.log(`[mediasoup] closed old recvTransport for peer=${peerId}`);
    }
    room.peers[peerId].recvTransport = transport;
  }
  transport.observer.on('connectionstatechange', (state) => {
    console.log(`[mediasoup] transport ${transport.id} peer=${peerId} dir=${direction} connectionState=${state}`);
  });
  transport.observer.on('close', () => {
    if (room.peers[peerId]) {
      if (room.peers[peerId].sendTransport === transport) room.peers[peerId].sendTransport = null;
      if (room.peers[peerId].recvTransport === transport) room.peers[peerId].recvTransport = null;
    }
  });
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

export async function connectWebRtcTransport(roomId, transportId, dtlsParameters) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  const transport = [...Object.values(room.peers)].flatMap(p => [p.sendTransport, p.recvTransport]).find(t => t && t.id === transportId);
  if (!transport) throw new Error('Transport not found');
  console.log(`[mediasoup] connect transport ${transportId} (client reached server)`);
  await transport.connect({ dtlsParameters });
}

export async function produce(roomId, transportId, peerId, kind, rtpParameters) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  const peer = room.peers[peerId];
  if (!peer || !peer.sendTransport || peer.sendTransport.id !== transportId) throw new Error('Transport not found');
  const producer = await peer.sendTransport.produce({ kind, rtpParameters });
  if (!producer || producer.id == null) {
    throw new Error('Produce returned no producer id');
  }
  peer.producers[producer.id] = producer;
  producer.observer.on('close', () => delete peer.producers[producer.id]);
  return { id: producer.id };
}

export async function consume(roomId, consumerPeerId, transportId, producerId, rtpCapabilities) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  const consumerPeer = room.peers[consumerPeerId];
  if (!consumerPeer || !consumerPeer.recvTransport || consumerPeer.recvTransport.id !== transportId) throw new Error('Transport not found');
  const producer = [...Object.values(room.peers)].flatMap(p => Object.values(p.producers || {})).find(p => p.id === producerId);
  if (!producer) throw new Error('Producer not found');
  if (!room.router.canConsume({ producerId: producer.id, rtpCapabilities })) {
    throw new Error('Cannot consume');
  }
  const consumer = await consumerPeer.recvTransport.consume({
    producerId: producer.id,
    rtpCapabilities,
    paused: true,
  });
  await consumer.resume();
  return {
    id: consumer.id,
    producerId: consumer.producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

export function getProducerPeerId(roomId, producerId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  for (const [pid, peer] of Object.entries(room.peers)) {
    if (peer.producers && peer.producers[producerId]) return pid;
  }
  return null;
}

function extractUsername(peerId) {
  if (!peerId) return peerId;
  const idx = peerId.lastIndexOf('_');
  if (idx > 0 && !isNaN(peerId.substring(idx + 1))) return peerId.substring(0, idx);
  return peerId;
}

export function getOtherPeersInRoom(roomId, excludePeerId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  const exUser = extractUsername(excludePeerId);
  return Object.keys(room.peers).filter(p => extractUsername(p) !== exUser);
}

export function registerPeerSocket(roomId, peerId, socketId) {
  peerIdBySocketId.set(socketId, { roomId, peerId });
}

export function unregisterPeerSocket(socketId) {
  const info = peerIdBySocketId.get(socketId);
  peerIdBySocketId.delete(socketId);
  return info || null;
}

export function removePeerFromRoom(roomId, peerId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  const matchingPeerIds = Object.keys(room.peers).filter(p => p === peerId || p.startsWith(peerId + '_'));
  if (matchingPeerIds.length === 0) return [];
  const closedProducers = [];
  for (const mpid of matchingPeerIds) {
    const peer = room.peers[mpid];
    for (const [pid, producer] of Object.entries(peer.producers || {})) {
      try { producer.close(); } catch(_) {}
      closedProducers.push({ producerId: pid, kind: producer.kind, peerId: mpid });
    }
    try { if (peer.sendTransport) peer.sendTransport.close(); } catch(_) {}
    try { if (peer.recvTransport) peer.recvTransport.close(); } catch(_) {}
    delete room.peers[mpid];
  }
  return closedProducers;
}

export function getPeerBySocketId(socketId) {
  return peerIdBySocketId.get(socketId);
}

export function getProducersInRoom(roomId, excludePeerId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  const exUser = extractUsername(excludePeerId);
  const list = [];
  for (const [peerId, peer] of Object.entries(room.peers)) {
    if (extractUsername(peerId) === exUser) continue;
    for (const prod of Object.values(peer.producers || {})) {
      list.push({ producerId: prod.id, peerId, kind: prod.kind });
    }
  }
  return list;
}

export function closeProducer(roomId, producerId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  for (const [peerId, peer] of Object.entries(room.peers)) {
    const producer = peer.producers[producerId];
    if (producer) {
      producer.close();
      delete peer.producers[producerId];
      return { peerId, kind: producer.kind };
    }
  }
  return null;
}

export function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (room && room.router) room.router.close();
  rooms.delete(roomId);
}

export function getRoomIds() {
  return Array.from(rooms.keys());
}

/** Log producer stats and transport stats (to see if RTP reaches server at all). */
export async function logProducerStatsForRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [peerId, peer] of Object.entries(room.peers)) {
    const sendT = peer.sendTransport;
    if (sendT) {
      try {
        const tStats = await sendT.getStats();
        const tEntry = tStats && tStats[0];
        const tBytes = tEntry && (tEntry.bytesReceived != null ? tEntry.bytesReceived : tEntry.rtpBytesReceived);
        console.log('[mediasoup-stats] room=%s TRANSPORT(send) peer=%s bytesReceived=%s', roomId, peerId, tBytes != null ? tBytes : '?');
      } catch (e) {
        console.log('[mediasoup-stats] room=%s TRANSPORT peer=%s error=%s', roomId, peerId, e.message);
      }
    }
    for (const [producerId, producer] of Object.entries(peer.producers || {})) {
      try {
        const stats = await producer.getStats();
        const entry = stats && stats.find((s) => s.type === 'inbound-rtp');
        const bytes = entry && (entry.byteCount ?? entry.bytesReceived);
        const pkts = entry && (entry.packetCount ?? entry.packetsReceived);
        if (bytes != null || pkts != null) {
          console.log('[mediasoup-stats] room=%s producer=%s peer=%s kind=%s bytes=%s pkts=%s', roomId, producerId, peerId, producer.kind, bytes ?? '?', pkts ?? '?');
        } else if (entry && Object.keys(entry).length) {
          console.log('[mediasoup-stats] room=%s producer=%s peer=%s keys=%s', roomId, producerId, peerId, Object.keys(entry).join(','));
        } else {
          console.log('[mediasoup-stats] room=%s producer=%s peer=%s kind=%s (no stats)', roomId, producerId, peerId, producer.kind);
        }
      } catch (e) {
        console.log('[mediasoup-stats] room=%s producer=%s error=%s', roomId, producerId, e.message);
      }
    }
  }
}

/** Return producer stats for a room (for client-side diagnostic). */
export async function getProducerStatsForRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  const out = [];
  for (const [peerId, peer] of Object.entries(room.peers)) {
    for (const [producerId, producer] of Object.entries(peer.producers || {})) {
      try {
        const stats = await producer.getStats();
        const entry = stats && stats.find((s) => s.type === 'inbound-rtp');
        const byteCount = entry && (entry.byteCount ?? entry.bytesReceived);
        const packetCount = entry && (entry.packetCount ?? entry.packetsReceived);
        out.push({ producerId, peerId, kind: producer.kind, byteCount: byteCount != null ? byteCount : 0, packetCount: packetCount != null ? packetCount : 0 });
      } catch (e) {
        out.push({ producerId, peerId, kind: producer.kind, byteCount: 0, error: e.message });
      }
    }
  }
  return out;
}
