import * as dns from "dns"
import { URL } from "url"

/** 私有 IP 段 */
const PRIVATE_RANGES = [
  { start: "10.0.0.0", end: "10.255.255.255" },
  { start: "172.16.0.0", end: "172.31.255.255" },
  { start: "192.168.0.0", end: "192.168.255.255" },
  { start: "127.0.0.0", end: "127.255.255.255" },
  { start: "::1", end: "::1" },
  { start: "0.0.0.0", end: "0.255.255.255" },
]

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number)
  return ((parts[0] || 0) << 24) | ((parts[1] || 0) << 16) | ((parts[2] || 0) << 8) | (parts[3] || 0)
}

function isPrivateIP(ip: string): boolean {
  const int = ipToInt(ip)
  for (const range of PRIVATE_RANGES) {
    if (int >= ipToInt(range.start) && int <= ipToInt(range.end)) return true
  }
  return false
}

/** SSRF 防护：检查 URL 的目标 IP 是否为私有内网地址 */
export async function assertSafeUrl(urlStr: string): Promise<void> {
  const url = new URL(urlStr)
  const hostname = url.hostname

  // 本地主机名直接拒绝
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") {
    throw new Error(`SSRF blocked: localhost address (${hostname})`)
  }

  // DNS 解析并检查 IP
  const addresses = await new Promise<string[]>((resolve) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err) {
        // DNS 解析失败，尝试 IPv6
        dns.resolve6(hostname, (err6, addrs6) => {
          resolve(err6 ? [] : addrs6)
        })
      } else {
        resolve(addresses)
      }
    })
  })

  for (const addr of addresses) {
    if (isPrivateIP(addr)) {
      throw new Error(`SSRF blocked: private IP address (${addr}) for ${hostname}`)
    }
  }
}
