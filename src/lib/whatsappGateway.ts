import { GatewayConfig, WhatsAppSession, Contact, WhatsAppChat, ChatMessage } from '../types';

/**
 * Sanitizes phone numbers to standard WhatsApp format (digits only).
 * Handles Brazilian DDD/DDI automatically.
 */
export function cleanPhoneNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  // If Brazilian number without DDI 55, add 55
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  return digits;
}

/**
 * Formats a raw phone string or digits into standard display format
 */
export function formatDisplayPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) {
      return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    } else if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    return `+55 ${ddd} ${rest}`;
  }
  if (digits.length >= 10) {
    return `+${digits}`;
  }
  return raw;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  rawResponse?: any;
}

export interface GatewayConnectionResult {
  status: 'connected' | 'disconnected' | 'qr_ready' | 'connecting';
  qrCodeBase64?: string | null;
  pairingCode?: string | null;
  phoneNumber?: string | null;
  pushName?: string | null;
  platform?: string;
  battery?: number;
  message?: string;
}

/**
 * Gateway API communication service for Evolution API, Z-API and Custom REST
 */
export const whatsappGatewayService = {
  /**
   * Checks the connection state and retrieves QR code if disconnected
   */
  async checkConnectionState(config: GatewayConfig): Promise<GatewayConnectionResult> {
    if (config.provider === 'simulator') {
      return {
        status: 'connected',
        phoneNumber: '+55 11 97654-3210',
        pushName: 'Simulador WhatsApp Web',
        platform: 'WhatsApp Web Simulado',
      };
    }

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const instance = encodeURIComponent(config.instanceName.trim());

    if (!baseUrl || !instance) {
      throw new Error('URL da API e Nome da Instância são obrigatórios.');
    }

    try {
      if (config.provider === 'evolution') {
        const trimmedKey = config.apiKey.trim();
        // Strict header as required by Evolution API: Apikey: <token>
        const evoHeaders: Record<string, string> = {
          'Apikey': trimmedKey,
          'Content-Type': 'application/json',
        };

        // If user mistakenly pasted the URL in apiKey, warn clearly
        if (trimmedKey.startsWith('http://') || trimmedKey.startsWith('https://')) {
          throw new Error(
            'A chave API informada parece ser uma URL.'
          );
        }

        // Unified helper: tries server-side proxy first (identical to HTTPie), then direct fetch
        const fetchEvo = async (endpoint: string, options: RequestInit = {}) => {
          const method = options.method || 'GET';
          // 1. Try local server-side proxy
          try {
            const proxyRes = await fetch('/api/whatsapp-proxy', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: endpoint,
                method,
                apiKey: trimmedKey,
                payload: options.body,
              }),
            });

            if (proxyRes.ok) {
              const proxyData = await proxyRes.json();
              // Wrap response into standard fetch-like object
              return {
                ok: proxyData.status >= 200 && proxyData.status < 300,
                status: proxyData.status,
                base64: proxyData.base64 || null,
                rawProxyData: proxyData,
                headers: new Headers({
                  'content-type': proxyData.contentType || 'application/json',
                }),
                json: async () => {
                  if (typeof proxyData.text === 'string') {
                    try {
                      return JSON.parse(proxyData.text);
                    } catch {
                      return proxyData.text;
                    }
                  }
                  return proxyData;
                },
                text: async () => proxyData.text || '',
                blob: async () => {
                  if (proxyData.base64) {
                    try {
                      const parts = proxyData.base64.split(',');
                      const byteString = atob(parts[1] || parts[0]);
                      const mimeString = (parts[0].match(/:(.*?);/) || ['', 'image/png'])[1];
                      const ab = new ArrayBuffer(byteString.length);
                      const ia = new Uint8Array(ab);
                      for (let i = 0; i < byteString.length; i++) {
                        ia[i] = byteString.charCodeAt(i);
                      }
                      return new Blob([ab], { type: mimeString });
                    } catch {
                      // ignore
                    }
                  }
                  return new Blob([proxyData.text || '']);
                },
              } as unknown as Response;
            }
          } catch {
            // If proxy is not available, proceed to direct fetch
          }

          // 2. Direct browser fetch with strict Apikey header
          return fetch(endpoint, {
            ...options,
            headers: {
              ...evoHeaders,
              ...(options.headers || {}),
            },
          });
        };

        // =========================================================================
        // PRIORITY CHECK 1: Direct /instance/status & /instance/qr (Evolution-Go / Wuzapi)
        // CRITICAL: On this server, routes MUST NEVER contain the instance name!
        // =========================================================================
        let isRootInstanceApi = false;
        try {
          // Check /instance/status
          const directStatusRes = await fetchEvo(`${baseUrl}/instance/status`, {
            method: 'GET',
          });

          if (directStatusRes.ok) {
            isRootInstanceApi = true;
            const statusData = await directStatusRes.json().catch(() => ({}));
            
            // Wuzapi / Evolution-Go status format: { data: { Connected: bool, LoggedIn: bool, Name: string }, message: string }
            // CRITICAL: Connected: true ONLY indicates the TCP connection to WhatsApp server is up.
            // LoggedIn: true indicates the user has actively scanned the QR code and authenticated!
            // When disconnected or after logout, LoggedIn is false even if Connected is true.
            let isConnected = false;
            if (statusData?.data && typeof statusData.data.LoggedIn === 'boolean') {
              isConnected = statusData.data.LoggedIn === true;
            } else {
              isConnected =
                statusData?.connected === true ||
                statusData?.state === 'open' ||
                statusData?.state === 'connected' ||
                statusData?.status === 'connected' ||
                statusData?.instance?.state === 'open' ||
                (statusData?.data?.Connected === true && !('LoggedIn' in (statusData?.data || {})));
            }

            if (isConnected) {
              const displayName =
                statusData?.data?.Name ||
                statusData?.name ||
                statusData?.profileName ||
                'WhatsApp Conectado';
              const displayPhone =
                statusData?.data?.Phone ||
                statusData?.phone ||
                statusData?.owner ||
                statusData?.number ||
                'WhatsApp Ativo';

              return {
                status: 'connected',
                phoneNumber: displayPhone,
                pushName: displayName,
                platform: 'WhatsApp Web (Evolution API)',
                battery: 100,
              };
            }
          } else if (directStatusRes.status === 401 || directStatusRes.status === 403) {
            throw new Error(
              'Chave de API inválida (Erro 401/403 na Evolution API). Verifique a chave de API informada.'
            );
          }
        } catch (err: any) {
          if (err.message && err.message.includes('Chave de API')) {
            throw err;
          }
        }

        // Direct fetch from /instance/qr
        try {
          const directQrRes = await fetchEvo(`${baseUrl}/instance/qr`, {
            method: 'GET',
          });

          if (directQrRes.ok) {
            isRootInstanceApi = true;
            // Direct base64 returned by server proxy
            const directBase64 = (directQrRes as any).base64;
            if (directBase64 && typeof directBase64 === 'string' && directBase64.length > 50) {
              return {
                status: 'qr_ready',
                qrCodeBase64: directBase64,
                message: 'QR Code recebido com sucesso de /instance/qr. Aponte a câmera do WhatsApp.',
              };
            }

            const contentType = directQrRes.headers.get('content-type') || '';

            // Case A: Image directly returned (image/png, image/jpeg, etc.)
            if (contentType.includes('image')) {
              try {
                const blob = await directQrRes.blob();
                const base64DataUrl = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });

                if (base64DataUrl && base64DataUrl.length > 50) {
                  return {
                    status: 'qr_ready',
                    qrCodeBase64: base64DataUrl,
                    message: 'QR Code recebido com sucesso de /instance/qr. Aponte a câmera do WhatsApp.',
                  };
                }
              } catch (blobErr) {
                console.warn('Erro ao processar blob da imagem QR:', blobErr);
              }
            }

            // Case B: Response is text or JSON
            const rawText = await directQrRes.text().catch(() => '');
            let parsedJson: any = null;
            try {
              parsedJson = JSON.parse(rawText);
            } catch {
              // rawText is plain string
            }

            let qrCandidate =
              parsedJson?.data?.qrcode ||
              parsedJson?.qrcode ||
              parsedJson?.data?.base64 ||
              parsedJson?.base64 ||
              parsedJson?.data?.code ||
              parsedJson?.code ||
              (typeof parsedJson?.data === 'string' ? parsedJson.data : null) ||
              parsedJson?.qr ||
              parsedJson?.hash?.qrcode ||
              (typeof parsedJson === 'string' ? parsedJson : null) ||
              rawText;

            if (typeof qrCandidate === 'string' && qrCandidate.trim().length > 0) {
              let finalDataUrl = qrCandidate.trim();

              // If it's already a data URL
              if (finalDataUrl.startsWith('data:image')) {
                return {
                  status: 'qr_ready',
                  qrCodeBase64: finalDataUrl,
                  pairingCode: parsedJson?.data?.code || parsedJson?.code || null,
                  message: 'QR Code recebido com sucesso de /instance/qr. Aponte a câmera do WhatsApp.',
                };
              }

              // If it's raw base64 (looks like base64 image data without prefix)
              if (finalDataUrl.startsWith('iVBORw0KGgo') || (finalDataUrl.length > 200 && !finalDataUrl.includes(' '))) {
                finalDataUrl = `data:image/png;base64,${finalDataUrl}`;
                return {
                  status: 'qr_ready',
                  qrCodeBase64: finalDataUrl,
                  pairingCode: parsedJson?.data?.code || parsedJson?.code || null,
                  message: 'QR Code recebido com sucesso de /instance/qr. Aponte a câmera do WhatsApp.',
                };
              }

              // If it's raw QR pairing string (e.g. 2@xxxx...), render via QR code image service
              const qrCodeServiceUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(finalDataUrl)}`;
              return {
                status: 'qr_ready',
                qrCodeBase64: qrCodeServiceUrl,
                pairingCode: parsedJson?.data?.code || parsedJson?.code || parsedJson?.pairingCode || null,
                message: 'QR Code gerado com sucesso de /instance/qr. Aponte a câmera do WhatsApp.',
              };
            }
          }

          if (isRootInstanceApi || directQrRes.status === 400) {
            const errBody = await directQrRes.text().catch(() => '');
            if (errBody.includes('53300') || errBody.includes('too many clients')) {
              return {
                status: 'disconnected',
                message: 'O PostgreSQL do servidor Evolution atingiu o limite de conexões (SQLSTATE 53300). Reinicie o container do PostgreSQL (outros_pg) e depois o da Evolution API no Easypanel.',
              };
            }
            return {
              status: 'disconnected',
              message: 'Sessão desconectada. Clique em "Gerar QR Code" para conectar.',
            };
          }
        } catch {
          // non-fatal, proceed
        }

        // If this server was detected as an instance-less API, DO NOT call multi-instance routes that would append the instance name!
        if (isRootInstanceApi) {
          return {
            status: 'disconnected',
            message: 'Aguardando QR Code. Clique em "Gerar QR Code".',
          };
        }

        // =========================================================================
        // CHECK 2: Multi-instance routes (/instance/connectionState/:id and /instance/connect/:id)
        // =========================================================================
        let existingInstances: string[] = [];
        try {
          const listRes = await fetchEvo(`${baseUrl}/instance/fetchInstances`, {
            headers: evoHeaders,
          });
          if (listRes.ok) {
            const listData = await listRes.json().catch(() => null);
            let list: any[] = [];
            if (Array.isArray(listData)) {
              list = listData;
            } else if (Array.isArray(listData?.instances)) {
              list = listData.instances;
            } else if (Array.isArray(listData?.data)) {
              list = listData.data;
            } else if (Array.isArray(listData?.result)) {
              list = listData.result;
            } else if (listData && typeof listData === 'object') {
              list = Object.values(listData).filter((v: any) => typeof v === 'object');
            }

            existingInstances = list
              .map((it: any) =>
                it?.instance?.instanceName ||
                it?.instanceName ||
                it?.name ||
                it?.instance?.name ||
                it?.id ||
                it?.instance?.id
              )
              .filter(Boolean);
          }
        } catch {
          // non-fatal
        }

        // Check if an instance with exact or case-insensitive name exists
        const cleanTarget = config.instanceName.trim();
        const matchedInstance = existingInstances.find(
          (name) =>
            name.toLowerCase() === cleanTarget.toLowerCase() ||
            name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget.toLowerCase().replace(/[^a-z0-9]/g, '')
        );
        const targetInstance = matchedInstance || cleanTarget;
        const encodedTarget = encodeURIComponent(targetInstance);

        // Check connection state for the instance
        let stateRes = await fetchEvo(`${baseUrl}/instance/connectionState/${encodedTarget}`, {
          method: 'GET',
        });

        // If connectionState is not ok (e.g. 404 or 401/403), try /instance/connect/:id directly
        // We do NOT auto-create because the user's instance already exists
        if (!stateRes.ok) {
          const tryConnectRes = await fetchEvo(`${baseUrl}/instance/connect/${encodedTarget}`, {
            method: 'GET',
          });
          if (tryConnectRes.ok) {
            stateRes = tryConnectRes;
          }
        }

        if (stateRes.status === 401 || stateRes.status === 403) {
          throw new Error(
            'Chave de API inválida (Erro 401/403 na Evolution API). Verifique se a variável AUTHENTICATION_API_KEY no painel do Easypanel corresponde exatamente à Chave de API preenchida no sistema.'
          );
        }

        if (stateRes.ok) {
          const stateData = await stateRes.json();

          // Check if stateData already returned the QR Code (common in /instance/connect)
          const stateQrBase64 =
            stateData?.data?.qrcode ||
            stateData?.data?.code ||
            stateData?.data?.base64 ||
            stateData?.base64 ||
            stateData?.qrcode?.base64 ||
            stateData?.code ||
            stateData?.qrcode?.code ||
            stateData?.hash?.qrcode ||
            stateData?.instance?.qrcode?.base64 ||
            (typeof stateData?.qrcode === 'string' ? stateData.qrcode : null) ||
            (typeof stateData === 'string' ? stateData : null);

          if (stateQrBase64 && typeof stateQrBase64 === 'string' && stateQrBase64.length > 50) {
            let finalQr = stateQrBase64.trim();
            if (finalQr.startsWith('iVBORw0KGgo')) {
              finalQr = `data:image/png;base64,${finalQr}`;
            } else if (!finalQr.startsWith('data:image') && !finalQr.startsWith('http')) {
              finalQr = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(finalQr)}`;
            }
            return {
              status: 'qr_ready',
              qrCodeBase64: finalQr,
              pairingCode: stateData?.pairingCode || stateData?.data?.pairingCode || null,
              message: 'QR Code recebido da Evolution API.',
            };
          }

          // Evolution returns state: "open" | "close" | "connecting"
          const stateStr =
            stateData?.instance?.state ||
            stateData?.state ||
            stateData?.connectionStatus ||
            '';

          if (stateStr === 'open' || stateStr === 'connected') {
            // Connected! Fetch instance details if available
            let phone: string | null = null;
            let pushName: string | null = null;

            try {
              const infoRes = await fetchEvo(`${baseUrl}/instance/fetchInstances?instanceName=${encodedTarget}`);
              if (infoRes.ok) {
                const infoData = await infoRes.json();
                const target = Array.isArray(infoData) ? infoData[0] : infoData;
                phone = target?.owner || target?.profilePictureUrl || null;
                pushName = target?.profileName || null;
              }
            } catch {
              // non-fatal
            }

            return {
              status: 'connected',
              phoneNumber: phone || `Instância: ${config.instanceName}`,
              pushName: pushName || 'Evolution API Conectada',
              platform: 'WhatsApp Web (Evolution API)',
              battery: 100,
            };
          }
        }

        // If disconnected or connecting, fetch QR Code
        let qrRes = await fetchEvo(`${baseUrl}/instance/connect/${encodedTarget}`, {
          method: 'GET',
        });

        // If /instance/connect returned 404, try alternative endpoints used across Evolution API versions
        if (qrRes.status === 404) {
          const altEndpoints = [
            `${baseUrl}/instance/qrcode/${encodedTarget}`,
            `${baseUrl}/instance/connect/${cleanTarget}`,
          ];
          for (const altUrl of altEndpoints) {
            try {
              const altRes = await fetchEvo(altUrl, { method: 'GET' });
              if (altRes.ok || altRes.status !== 404) {
                qrRes = altRes;
                break;
              }
            } catch {
              // try next
            }
          }
        }

        if (qrRes.ok) {
          const qrData = await qrRes.json();
          const base64 =
            qrData?.data?.qrcode ||
            qrData?.data?.code ||
            qrData?.data?.base64 ||
            qrData?.base64 ||
            qrData?.qrcode?.base64 ||
            qrData?.code ||
            qrData?.qrcode?.code ||
            qrData?.hash?.qrcode ||
            qrData?.instance?.qrcode?.base64 ||
            (typeof qrData?.qrcode === 'string' ? qrData.qrcode : null) ||
            (typeof qrData === 'string' ? qrData : null);
          const pairingCode = qrData?.pairingCode || qrData?.data?.pairingCode || null;

          if (base64) {
            let finalQr = base64.trim();
            if (finalQr.startsWith('iVBORw0KGgo')) {
              finalQr = `data:image/png;base64,${finalQr}`;
            } else if (!finalQr.startsWith('data:image') && !finalQr.startsWith('http')) {
              finalQr = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(finalQr)}`;
            }
            return {
              status: 'qr_ready',
              qrCodeBase64: finalQr,
              pairingCode: pairingCode,
              message: 'QR Code recebido da Evolution API.',
            };
          }
        }

        if (qrRes.status === 404) {
          const foundInfo = existingInstances.length > 0
            ? ` Instâncias detectadas ativas no seu servidor: [${existingInstances.join(', ')}]. Digite o nome correspondente em "Nome da Instância".`
            : ` Nenhuma instância ativa foi retornada pelo servidor Evolution API (verifique se a instância "${config.instanceName}" foi criada no painel e se a URL e Token estão corretos).`;
          throw new Error(
            `A instância "${config.instanceName}" não foi encontrada no servidor (Erro 404).${foundInfo}`
          );
        }

        if (!qrRes.ok) {
          const errText = await qrRes.text();
          throw new Error(`Erro Evolution API (${qrRes.status}): ${errText}`);
        }

        return {
          status: 'disconnected',
          message: 'Instância desconectada. Solicite novo QR Code.',
        };
      }

      if (config.provider === 'zapi') {
        // Z-API status
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (config.zapiClientToken) {
          headers['Client-Token'] = config.zapiClientToken;
        }

        const statusRes = await fetch(`${baseUrl}/instances/${instance}/token/${config.apiKey}/status`, {
          headers,
        });

        if (!statusRes.ok) {
          throw new Error(`Erro Z-API (${statusRes.status}): ${await statusRes.text()}`);
        }

        const statusData = await statusRes.json();
        // Z-API returns connected: boolean
        if (statusData?.connected) {
          return {
            status: 'connected',
            phoneNumber: statusData?.phone ? `+${statusData.phone}` : `Instância: ${config.instanceName}`,
            pushName: statusData?.name || 'Z-API Conectada',
            platform: 'WhatsApp Cloud (Z-API)',
            battery: 100,
          };
        } else {
          // Get QR Code
          const qrRes = await fetch(`${baseUrl}/instances/${instance}/token/${config.apiKey}/qr-code/image`, {
            headers,
          });

          if (qrRes.ok) {
            const qrData = await qrRes.json();
            return {
              status: 'qr_ready',
              qrCodeBase64: qrData?.value || qrData?.link || null,
              message: 'QR Code recebido da Z-API.',
            };
          }

          return {
            status: 'disconnected',
            message: 'Aguardando inicialização da Z-API.',
          };
        }
      }

      if (config.provider === 'custom_rest') {
        // Custom REST API ping
        const res = await fetch(`${baseUrl}/status`, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'x-api-key': config.apiKey,
          },
        });

        if (res.ok) {
          const data = await res.json();
          return {
            status: data?.status === 'connected' ? 'connected' : 'disconnected',
            phoneNumber: data?.phone || config.instanceName,
            pushName: data?.pushName || 'Custom REST Gateway',
            platform: 'Custom Gateway REST',
          };
        } else {
          throw new Error(`Custom Gateway retornou status ${res.status}`);
        }
      }

      return {
        status: 'disconnected',
        message: 'Provedor não configurado.',
      };
    } catch (err: any) {
      throw new Error(err?.message || 'Falha ao comunicar com o Gateway do WhatsApp.');
    }
  },

  /**
   * Sends real WhatsApp message using the selected Gateway API
   */
  async sendMessage(
    config: GatewayConfig,
    rawPhone: string,
    message: string
  ): Promise<SendMessageResult> {
    const cleanPhone = cleanPhoneNumber(rawPhone);

    if (config.provider === 'simulator') {
      // Simulation mode: instantly succeeds with realistic mock response
      return {
        success: true,
        messageId: `sim_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      };
    }

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const instance = encodeURIComponent(config.instanceName.trim());

    try {
      if (config.provider === 'evolution') {
        const trimmedKey = config.apiKey.trim();
        const evoSendHeaders: Record<string, string> = {
          'Apikey': trimmedKey,
          'Content-Type': 'application/json',
        };

        const payload = {
          number: cleanPhone,
          phone: cleanPhone,
          text: message,
          message: message,
          delay: 1200,
          linkPreview: true,
        };

        const sendRequest = async (url: string) => {
          try {
            const proxyRes = await fetch('/api/whatsapp-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url,
                method: 'POST',
                apiKey: trimmedKey,
                payload,
              }),
            });
            if (proxyRes.ok) {
              const pData = await proxyRes.json();
              return {
                ok: pData.status >= 200 && pData.status < 300,
                status: pData.status,
                json: async () => {
                  try {
                    return JSON.parse(pData.text);
                  } catch {
                    return pData;
                  }
                },
              };
            }
          } catch {
            // fallback
          }

          return fetch(url, {
            method: 'POST',
            headers: evoSendHeaders,
            body: JSON.stringify(payload),
          });
        };

        // Try primary endpoint 1: /send/text (Evolution-Go / Wuzapi)
        let response = await sendRequest(`${baseUrl}/send/text`);

        // Fallback 1: /message/sendText/{instance} (Evolution Node v2)
        if (response.status === 404) {
          response = await sendRequest(`${baseUrl}/message/sendText/${instance}`);
        }

        // Fallback 2: Direct endpoint /message/sendText (monoinstance)
        if (response.status === 404) {
          response = await sendRequest(`${baseUrl}/message/sendText`);
        }

        // Fallback 3: Direct endpoint /message/send
        if (response.status === 404) {
          response = await sendRequest(`${baseUrl}/message/send`);
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          return {
            success: false,
            error: data?.response?.message || data?.message || data?.error || `Erro ${response.status} na Evolution API`,
            rawResponse: data,
          };
        }

        const messageId = data?.key?.id || data?.id || data?.messageId || `evo_${Date.now()}`;
        return {
          success: true,
          messageId,
          rawResponse: data,
        };
      }

      if (config.provider === 'zapi') {
        // Z-API: POST /instances/{instance}/token/{token}/send-text
        const endpoint = `${baseUrl}/instances/${instance}/token/${config.apiKey}/send-text`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (config.zapiClientToken) {
          headers['Client-Token'] = config.zapiClientToken;
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: cleanPhone,
            message: message,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            success: false,
            error: data?.message || data?.error || `Erro ${response.status} na Z-API`,
            rawResponse: data,
          };
        }

        const messageId = data?.messageId || data?.id || `zapi_${Date.now()}`;
        return {
          success: true,
          messageId,
          rawResponse: data,
        };
      }

      if (config.provider === 'custom_rest') {
        // Custom REST POST /send
        const endpoint = `${baseUrl}/send`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'x-api-key': config.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: cleanPhone,
            message: message,
            instance: config.instanceName,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            success: false,
            error: data?.message || `Erro ${response.status} no Custom Gateway`,
            rawResponse: data,
          };
        }

        return {
          success: true,
          messageId: data?.id || data?.messageId || `custom_${Date.now()}`,
          rawResponse: data,
        };
      }

      return {
        success: false,
        error: 'Provedor de Gateway desconhecido.',
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Falha de rede ao tentar enviar para a API do WhatsApp.',
      };
    }
  },

  /**
   * Fetches real contacts from WhatsApp via Evolution API / Z-API
   */
  async fetchContacts(config: GatewayConfig): Promise<{
    success: boolean;
    contacts: Contact[];
    count: number;
    error?: string;
  }> {
    if (config.provider === 'simulator') {
      return {
        success: true,
        contacts: [],
        count: 0,
        error: 'No modo Simulador, utilize os contatos pré-carregados para testes.',
      };
    }

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const instance = encodeURIComponent(config.instanceName.trim());
    const trimmedKey = config.apiKey.trim();

    if (!baseUrl) {
      return {
        success: false,
        contacts: [],
        count: 0,
        error: 'URL da API não informada.',
      };
    }

    const fetchHelper = async (url: string, method: string = 'GET', payload?: any) => {
      try {
        const proxyRes = await fetch('/api/whatsapp-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            method,
            apiKey: trimmedKey,
            payload,
          }),
        });
        if (proxyRes.ok) {
          const pData = await proxyRes.json();
          return {
            ok: pData.status >= 200 && pData.status < 300,
            status: pData.status,
            json: async () => {
              try {
                return JSON.parse(pData.text);
              } catch {
                return pData;
              }
            },
          };
        }
      } catch {
        // fallback to direct
      }

      return fetch(url, {
        method,
        headers: {
          'Apikey': trimmedKey,
          'Content-Type': 'application/json',
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
    };

    try {
      let rawContactsList: any[] = [];

      if (config.provider === 'evolution') {
        // Attempt 1: /user/contacts (Evolution-Go / Wuzapi - user server priority)
        let res = await fetchHelper(`${baseUrl}/user/contacts`, 'GET');

        if (!res.ok || res.status === 404) {
          // Attempt 2: /chat/findContacts/{instance} (Evolution Node v2)
          res = await fetchHelper(`${baseUrl}/chat/findContacts/${instance}`, 'POST', {});
        }

        if (!res.ok || res.status === 404) {
          // Attempt 3: /chat/findChats/{instance} (Evolution Node v2 chats)
          res = await fetchHelper(`${baseUrl}/chat/findChats/${instance}`, 'GET');
        }

        if (!res.ok || res.status === 404) {
          // Attempt 4: /chat/findContacts (Evolution single-instance)
          res = await fetchHelper(`${baseUrl}/chat/findContacts`, 'GET');
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          return {
            success: false,
            contacts: [],
            count: 0,
            error: errData?.message || `Falha ao buscar contatos na API (HTTP ${res.status}).`,
          };
        }

        const resData = await res.json();
        if (Array.isArray(resData)) {
          rawContactsList = resData;
        } else if (Array.isArray(resData?.data)) {
          rawContactsList = resData.data;
        } else if (Array.isArray(resData?.contacts)) {
          rawContactsList = resData.contacts;
        } else if (Array.isArray(resData?.chats)) {
          rawContactsList = resData.chats;
        }
      } else if (config.provider === 'zapi') {
        const res = await fetchHelper(`${baseUrl}/instances/${instance}/token/${trimmedKey}/contacts`, 'GET');
        if (res.ok) {
          const data = await res.json();
          rawContactsList = Array.isArray(data) ? data : (data?.data || []);
        }
      }

      if (!rawContactsList || rawContactsList.length === 0) {
        return {
          success: true,
          contacts: [],
          count: 0,
          error: 'Nenhum contato encontrado na instância do WhatsApp.',
        };
      }

      // Format and sanitize contacts into Contact interface
      const seenPhones = new Set<string>();
      const parsedContacts: Contact[] = [];

      for (const item of rawContactsList) {
        if (!item) continue;
        const jid = String(item.Jid || item.jid || item.id || item.remoteJid || item.number || item.phone || '');

        // Exclude group chats, status broadcasts, newsletters
        if (
          jid.includes('@g.us') || 
          jid.includes('@broadcast') || 
          jid.includes('@newsletter') ||
          jid.includes('status@')
        ) {
          continue;
        }

        const digits = jid.split('@')[0].replace(/\D/g, '');
        if (!digits || digits.length < 8) continue;

        // Prevent duplicates
        if (seenPhones.has(digits)) continue;
        seenPhones.add(digits);

        const fullName = String(
          item.FullName ||
          item.fullName ||
          item.name ||
          item.PushName ||
          item.pushName ||
          item.FirstName ||
          item.firstName ||
          item.BusinessName ||
          item.businessName ||
          ''
        ).trim();

        const business = String(item.BusinessName || item.businessName || '').trim();
        const displayPhone = formatDisplayPhone(digits);
        const contactName = fullName || displayPhone;
        const firstName = String(item.FirstName || item.firstName || contactName.split(' ')[0] || '').trim();

        parsedContacts.push({
          id: `wpp_${digits}`,
          name: contactName,
          phone: displayPhone,
          profileIds: [],
          notes: business ? `Empresa: ${business}` : 'Importado do WhatsApp',
          addedAt: new Date().toISOString(),
          customData: {
            primeiro_nome: firstName,
            nome_completo: contactName,
            empresa: business,
            whatsapp_jid: jid,
          },
        });
      }

      return {
        success: true,
        contacts: parsedContacts,
        count: parsedContacts.length,
      };
    } catch (err: any) {
      return {
        success: false,
        contacts: [],
        count: 0,
        error: err?.message || 'Falha ao sincronizar contatos do WhatsApp.',
      };
    }
  },

  /**
   * Fetches real active WhatsApp conversations (chats) with their last messages, pinned status, and unread counts.
   */
  async fetchChats(config: GatewayConfig): Promise<{
    success: boolean;
    chats: WhatsAppChat[];
    count: number;
    error?: string;
  }> {
    if (config.provider === 'simulator') {
      return {
        success: true,
        chats: [],
        count: 0,
      };
    }

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const instance = encodeURIComponent(config.instanceName.trim());
    const trimmedKey = config.apiKey.trim();

    if (!baseUrl) {
      return {
        success: false,
        chats: [],
        count: 0,
        error: 'URL da API não informada.',
      };
    }

    const fetchHelper = async (url: string, method: string = 'GET', payload?: any) => {
      try {
        const proxyRes = await fetch('/api/whatsapp-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            method,
            apiKey: trimmedKey,
            payload,
          }),
        });
        if (proxyRes.ok) {
          const pData = await proxyRes.json();
          return {
            ok: pData.status >= 200 && pData.status < 300,
            status: pData.status,
            json: async () => {
              try {
                return JSON.parse(pData.text);
              } catch {
                return pData;
              }
            },
          };
        }
      } catch {
        // fallback to direct
      }

      return fetch(url, {
        method,
        headers: {
          'Apikey': trimmedKey,
          'Content-Type': 'application/json',
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
    };

    try {
      let rawChatsList: any[] = [];

      if (config.provider === 'evolution') {
        // Attempt 1: Evolution Node v2 findChats POST with high limit to fetch full list
        let res = await fetchHelper(`${baseUrl}/chat/findChats/${instance}`, 'POST', {
          limit: 100,
          page: 1,
        });

        if (!res.ok || res.status === 404) {
          // Attempt 2: Evolution Node v2 findChats GET with limit
          res = await fetchHelper(`${baseUrl}/chat/findChats/${instance}?limit=100`, 'GET');
        }

        if (!res.ok || res.status === 404) {
          // Attempt 3: Evolution v1 findChats
          res = await fetchHelper(`${baseUrl}/chat/findChats?limit=100`, 'GET');
        }

        if (!res.ok || res.status === 404) {
          // Attempt 4: Evolution-Go / Wuzapi /chat/chats
          res = await fetchHelper(`${baseUrl}/chat/chats?limit=100`, 'GET');
        }

        if (!res.ok || res.status === 404) {
          // Attempt 5: Evolution-Go /user/chats
          res = await fetchHelper(`${baseUrl}/user/chats?limit=100`, 'GET');
        }

        if (!res.ok || res.status === 404) {
          // Attempt 6: Evolution-Go /chat/list
          res = await fetchHelper(`${baseUrl}/chat/list?limit=100`, 'GET');
        }

        if (res.ok) {
          const resData = await res.json();
          if (Array.isArray(resData)) {
            rawChatsList = resData;
          } else if (Array.isArray(resData?.data)) {
            rawChatsList = resData.data;
          } else if (Array.isArray(resData?.chats)) {
            rawChatsList = resData.chats;
          } else if (Array.isArray(resData?.records)) {
            rawChatsList = resData.records;
          }
        }
      } else if (config.provider === 'zapi') {
        const res = await fetchHelper(`${baseUrl}/instances/${instance}/token/${trimmedKey}/chats?limit=100`, 'GET');
        if (res.ok) {
          const data = await res.json();
          rawChatsList = Array.isArray(data) ? data : (data?.data || []);
        }
      } else if (config.provider === 'custom_rest') {
        const res = await fetchHelper(`${baseUrl}/chats?limit=100`, 'GET');
        if (res.ok) {
          const data = await res.json();
          rawChatsList = Array.isArray(data) ? data : (data?.data || []);
        }
      }

      if (!rawChatsList || rawChatsList.length === 0) {
        return {
          success: true,
          chats: [],
          count: 0,
          error: 'Nenhuma conversa ativa encontrada na API.',
        };
      }

      const parsedChats: WhatsAppChat[] = [];
      const seenChatIds = new Set<string>();

      for (const item of rawChatsList) {
        if (!item) continue;
        const rawJid = String(
          item.id || item.jid || item.remoteJid || item.chatId || item.number || item.phone || ''
        );
        if (!rawJid) continue;

        // Skip broadcasts, newsletters, status updates
        if (
          rawJid.includes('status@') ||
          rawJid.includes('@broadcast') ||
          rawJid.includes('@newsletter')
        ) {
          continue;
        }

        const isGroup = rawJid.includes('@g.us') || Boolean(item.isGroup);
        const digits = rawJid.split('@')[0].replace(/\D/g, '');

        const chatId = isGroup ? rawJid : (digits || rawJid);
        if (seenChatIds.has(chatId)) continue;
        seenChatIds.add(chatId);

        // Name
        const name = String(
          item.name ||
          item.pushName ||
          item.subject ||
          item.formattedTitle ||
          item.verifiedName ||
          item.FullName ||
          item.fullName ||
          (isGroup ? 'Grupo WhatsApp' : (digits ? formatDisplayPhone(digits) : rawJid))
        ).trim();

        // Pinned
        const isPinned = Boolean(
          item.isPinned ||
          item.pinned ||
          item.pin ||
          (typeof item.pinTimestamp === 'number' && item.pinTimestamp > 0) ||
          (item.pinnedTimestamp && item.pinnedTimestamp > 0)
        );

        // Muted
        const isMuted = Boolean(
          item.isMuted ||
          item.muted ||
          (item.mute && item.mute > 0) ||
          (item.muteEndTime && item.muteEndTime > 0)
        );

        // Unread
        const unreadCount = Number(item.unreadCount || item.unreadMessages || item.unread || 0);

        // Last Message extraction
        let lastMessageText = '';
        if (typeof item.lastMessage === 'string') {
          lastMessageText = item.lastMessage;
        } else if (item.lastMessage && typeof item.lastMessage === 'object') {
          const msgObj = item.lastMessage.message || item.lastMessage;
          lastMessageText =
            msgObj.conversation ||
            msgObj.extendedTextMessage?.text ||
            msgObj.imageMessage?.caption ||
            msgObj.videoMessage?.caption ||
            msgObj.documentMessage?.title ||
            (msgObj.audioMessage ? '🎤 Mensagem de áudio' : '') ||
            (msgObj.imageMessage ? '📷 Foto' : '') ||
            (msgObj.videoMessage ? '🎥 Vídeo' : '') ||
            (msgObj.stickerMessage ? '🏷️ Figurinha' : '') ||
            item.lastMessage.text ||
            item.lastMsg ||
            '';
        } else if (typeof item.lastMsg === 'string') {
          lastMessageText = item.lastMsg;
        } else if (typeof item.message === 'string') {
          lastMessageText = item.message;
        }

        // Never set "Carregando..." as a fallback last message
        if (!lastMessageText || lastMessageText.toLowerCase() === 'carregando...') {
          lastMessageText = isGroup ? 'Conversa em grupo' : 'Toque para conversar...';
        }

        // Timestamp
        let timestampStr = new Date().toISOString();
        const rawTime =
          item.lastMessageTimestamp ||
          item.conversationTimestamp ||
          item.messageTimestamp ||
          item.lastMessage?.messageTimestamp ||
          item.updatedAt ||
          item.timestamp;

        if (rawTime) {
          if (typeof rawTime === 'number') {
            const ms = rawTime < 1e11 ? rawTime * 1000 : rawTime;
            timestampStr = new Date(ms).toISOString();
          } else if (typeof rawTime === 'string') {
            const d = new Date(rawTime);
            if (!isNaN(d.getTime())) {
              timestampStr = d.toISOString();
            }
          }
        }

        const phoneDisplay = isGroup ? (name || 'Grupo WhatsApp') : (digits ? formatDisplayPhone(digits) : rawJid);

        parsedChats.push({
          id: chatId,
          name: name || phoneDisplay,
          phone: phoneDisplay,
          jid: rawJid,
          lastMessage: lastMessageText,
          lastMessageTimestamp: timestampStr,
          unreadCount: isNaN(unreadCount) ? 0 : unreadCount,
          isGroup,
          isPinned,
          isMuted,
        });
      }

      // Sort: pinned first, then by last message timestamp desc
      parsedChats.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const timeA = a.lastMessageTimestamp ? new Date(a.lastMessageTimestamp).getTime() : 0;
        const timeB = b.lastMessageTimestamp ? new Date(b.lastMessageTimestamp).getTime() : 0;
        return timeB - timeA;
      });

      return {
        success: true,
        chats: parsedChats,
        count: parsedChats.length,
      };
    } catch (err: any) {
      return {
        success: false,
        chats: [],
        count: 0,
        error: err?.message || 'Falha ao buscar conversas da API do WhatsApp.',
      };
    }
  },

  /**
   * Fetches real messages for a specific chat from the Gateway API
   */
  async fetchChatMessages(
    config: GatewayConfig,
    phoneOrJid: string
  ): Promise<{
    success: boolean;
    messages: ChatMessage[];
    error?: string;
  }> {
    if (config.provider === 'simulator') {
      return { success: true, messages: [] };
    }

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const instance = encodeURIComponent(config.instanceName.trim());
    const trimmedKey = config.apiKey.trim();
    const cleanDigits = phoneOrJid.replace(/\D/g, '');
    const targetJid = phoneOrJid.includes('@')
      ? phoneOrJid
      : `${cleanDigits}@s.whatsapp.net`;

    const fetchHelper = async (url: string, method: string = 'GET', payload?: any) => {
      try {
        const proxyRes = await fetch('/api/whatsapp-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            method,
            apiKey: trimmedKey,
            payload,
          }),
        });
        if (proxyRes.ok) {
          const pData = await proxyRes.json();
          return {
            ok: pData.status >= 200 && pData.status < 300,
            status: pData.status,
            json: async () => {
              try {
                return JSON.parse(pData.text);
              } catch {
                return pData;
              }
            },
          };
        }
      } catch {}

      return fetch(url, {
        method,
        headers: {
          'Apikey': trimmedKey,
          'Content-Type': 'application/json',
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
    };

    try {
      let rawMsgs: any[] = [];

      if (config.provider === 'evolution') {
        // Attempt 1: Evolution Node v2 POST /chat/findMessages/{instance}
        let res = await fetchHelper(`${baseUrl}/chat/findMessages/${instance}`, 'POST', {
          where: { key: { remoteJid: targetJid } },
          limit: 50,
        });

        if (!res.ok || res.status === 404) {
          // Attempt 2: Evolution Node v2 GET /chat/findMessages/{instance}?remoteJid=...
          res = await fetchHelper(
            `${baseUrl}/chat/findMessages/${instance}?remoteJid=${encodeURIComponent(targetJid)}&limit=50`,
            'GET'
          );
        }

        if (!res.ok || res.status === 404) {
          // Attempt 3: Evolution-Go /chat/messages?chat=...
          res = await fetchHelper(
            `${baseUrl}/chat/messages?chat=${encodeURIComponent(targetJid)}`,
            'GET'
          );
        }

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) rawMsgs = data;
          else if (Array.isArray(data?.messages)) rawMsgs = data.messages;
          else if (Array.isArray(data?.data)) rawMsgs = data.data;
          else if (Array.isArray(data?.records)) rawMsgs = data.records;
        }
      }

      const parsedMessages: ChatMessage[] = [];
      for (const m of rawMsgs) {
        if (!m) continue;
        const msgKey = m.key || {};
        const fromMe = Boolean(msgKey.fromMe || m.fromMe);
        const msgId = String(msgKey.id || m.id || `msg_${Date.now()}_${Math.random()}`);

        const msgContent = m.message || m;
        const text = String(
          msgContent.conversation ||
          msgContent.extendedTextMessage?.text ||
          msgContent.imageMessage?.caption ||
          msgContent.videoMessage?.caption ||
          msgContent.documentMessage?.title ||
          (msgContent.audioMessage ? '🎤 Mensagem de áudio' : '') ||
          (msgContent.imageMessage ? '📷 Foto' : '') ||
          (msgContent.videoMessage ? '🎥 Vídeo' : '') ||
          m.text ||
          m.body ||
          ''
        ).trim();

        if (!text) continue;

        let timestampStr = new Date().toISOString();
        const rawTime = m.messageTimestamp || m.timestamp || msgKey.timestamp;
        if (rawTime) {
          const ms = typeof rawTime === 'number' && rawTime < 1e11 ? rawTime * 1000 : Number(rawTime);
          if (!isNaN(ms)) timestampStr = new Date(ms).toISOString();
        }

        parsedMessages.push({
          id: msgId,
          chatId: phoneOrJid,
          sender: fromMe ? 'me' : 'contact',
          text,
          timestamp: timestampStr,
          status: 'read',
        });
      }

      return {
        success: true,
        messages: parsedMessages,
      };
    } catch (err: any) {
      return {
        success: false,
        messages: [],
        error: err?.message || 'Falha ao buscar mensagens.',
      };
    }
  },

  /**
   * Pins or unpins a chat in WhatsApp (Evolution API / Go)
   */
  async setChatPin(config: GatewayConfig, phoneOrJid: string, pin: boolean): Promise<boolean> {
    if (config.provider === 'simulator') return true;
    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const endpoint = pin ? `${baseUrl}/chat/pin` : `${baseUrl}/chat/unpin`;
    const cleanDigits = phoneOrJid.replace(/\D/g, '');
    const jid = phoneOrJid.includes('@') ? phoneOrJid : `${cleanDigits}@s.whatsapp.net`;

    try {
      await fetch('/api/whatsapp-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: endpoint,
          method: 'POST',
          apiKey: config.apiKey,
          payload: { chat: jid },
        }),
      });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Requests a fresh QR Code from the gateway (triggers connect once with valid events, then polls /instance/qr)
   */
  async requestQrCode(config: GatewayConfig): Promise<GatewayConnectionResult> {
    if (config.provider === 'simulator') {
      return this.checkConnectionState(config);
    }

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const trimmedKey = config.apiKey.trim();

    try {
      if (config.provider === 'evolution') {
        // Step 1: Initialize connection session ONCE with valid event subscription
        try {
          await fetch('/api/whatsapp-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: `${baseUrl}/instance/connect`,
              method: 'POST',
              apiKey: trimmedKey,
              payload: { subscribe: ['MESSAGE'] },
            }),
          });
        } catch {
          // ignore error and proceed to poll qr
        }

        // Wait 2.5 seconds for WhatsApp server handshaking
        await new Promise((resolve) => setTimeout(resolve, 2500));

        // Step 2: Poll /instance/qr up to 4 times (without calling /instance/connect again)
        for (let attempt = 1; attempt <= 4; attempt++) {
          const qrRes = await fetch('/api/whatsapp-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: `${baseUrl}/instance/qr`,
              method: 'GET',
              apiKey: trimmedKey,
            }),
          });

          if (qrRes.ok) {
            const proxyData = await qrRes.json();
            if (proxyData.status >= 200 && proxyData.status < 300) {
              if (proxyData.base64 && typeof proxyData.base64 === 'string') {
                return {
                  status: 'qr_ready',
                  qrCodeBase64: proxyData.base64,
                  message: 'QR Code pronto. Aponte a câmera do WhatsApp.',
                };
              }
              let parsed: any = null;
              try {
                parsed = typeof proxyData.text === 'string' ? JSON.parse(proxyData.text) : proxyData;
              } catch {
                parsed = null;
              }

              const qrCandidate =
                parsed?.data?.qrcode ||
                parsed?.qrcode ||
                parsed?.data?.base64 ||
                parsed?.base64 ||
                parsed?.data?.code ||
                parsed?.code ||
                proxyData.text;

              if (typeof qrCandidate === 'string' && qrCandidate.trim().length > 10) {
                let finalDataUrl = qrCandidate.trim();
                if (finalDataUrl.startsWith('data:image')) {
                  return {
                    status: 'qr_ready',
                    qrCodeBase64: finalDataUrl,
                    pairingCode: parsed?.data?.code || parsed?.code || null,
                    message: 'QR Code pronto. Aponte a câmera do WhatsApp.',
                  };
                }
                if (finalDataUrl.startsWith('iVBORw0KGgo') || (finalDataUrl.length > 200 && !finalDataUrl.includes(' '))) {
                  finalDataUrl = `data:image/png;base64,${finalDataUrl}`;
                  return {
                    status: 'qr_ready',
                    qrCodeBase64: finalDataUrl,
                    pairingCode: parsed?.data?.code || parsed?.code || null,
                    message: 'QR Code pronto. Aponte a câmera do WhatsApp.',
                  };
                }
                const qrCodeServiceUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(finalDataUrl)}`;
                return {
                  status: 'qr_ready',
                  qrCodeBase64: qrCodeServiceUrl,
                  pairingCode: parsed?.data?.code || parsed?.code || null,
                  message: 'QR Code gerado. Aponte a câmera do WhatsApp.',
                };
              }
            } else if (proxyData.text && (proxyData.text.includes('53300') || proxyData.text.includes('too many clients'))) {
              return {
                status: 'disconnected',
                message: 'O PostgreSQL do servidor atingiu o limite de conexões (SQLSTATE 53300). Reinicie o container da Evolution API no painel do Easypanel para liberar.',
              };
            }
          }

          if (attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        return {
          status: 'disconnected',
          message: 'O WhatsApp ainda não liberou o QR Code. Se acabou de desconectar, aguarde alguns instantes e clique em "Gerar QR Code".',
        };
      }

      return this.checkConnectionState(config);
    } catch (err: any) {
      return {
        status: 'disconnected',
        message: err.message || 'Falha ao solicitar QR Code.',
      };
    }
  },

  /**
   * Request pairing code for phone number (Evolution-Go POST /instance/pair or Evolution v2)
   */
  async requestPairingCode(config: GatewayConfig, phoneNumber: string): Promise<{ success: boolean; pairingCode?: string; error?: string }> {
    if (config.provider === 'simulator') {
      return {
        success: true,
        pairingCode: 'SIMU-LATE',
      };
    }

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const cleanPhone = cleanPhoneNumber(phoneNumber);
    if (!cleanPhone || cleanPhone.length < 8) {
      return { success: false, error: 'Número de telefone inválido para pareamento.' };
    }

    try {
      if (config.provider === 'evolution') {
        const trimmedKey = config.apiKey.trim();
        const res = await fetch('/api/whatsapp-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `${baseUrl}/instance/pair`,
            method: 'POST',
            apiKey: trimmedKey,
            payload: { phone: cleanPhone },
          }),
        });

        if (res.ok) {
          const proxyData = await res.json();
          let json: any = {};
          try {
            json = typeof proxyData.text === 'string' ? JSON.parse(proxyData.text) : proxyData;
          } catch {
            json = proxyData;
          }

          const code =
            json?.data?.PairingCode ||
            json?.data?.pairingCode ||
            json?.PairingCode ||
            json?.pairingCode ||
            json?.code ||
            json?.data?.code;

          if (code) {
            return { success: true, pairingCode: String(code) };
          }
          if (json?.error) {
            return { success: false, error: json.error };
          }
        }
      }
      return { success: false, error: 'Não foi possível obter o código de pareamento. Verifique se o servidor está ativo.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao solicitar código de pareamento' };
    }
  },

  /**
   * Disconnects / Logs out instance cleanly
   */
  async disconnectInstance(config: GatewayConfig): Promise<boolean> {
    if (config.provider === 'simulator') return true;

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const instance = encodeURIComponent(config.instanceName.trim());

    try {
      if (config.provider === 'evolution') {
        // 1. Try root /instance/logout with DELETE method (Wuzapi / Evolution-Go)
        try {
          const res = await fetch('/api/whatsapp-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: `${baseUrl}/instance/logout`,
              method: 'DELETE',
              apiKey: config.apiKey,
            }),
          });
          if (res.ok) {
            return true;
          }
        } catch {
          // fallback
        }

        // 2. Try root /instance/disconnect with POST method
        try {
          const res = await fetch('/api/whatsapp-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: `${baseUrl}/instance/disconnect`,
              method: 'POST',
              apiKey: config.apiKey,
            }),
          });
          if (res.ok) return true;
        } catch {
          // fallback
        }

        // 3. Fallback for multi-instance Evolution (/instance/logout/:instance)
        try {
          await fetch('/api/whatsapp-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: `${baseUrl}/instance/logout/${instance}`,
              method: 'DELETE',
              apiKey: config.apiKey,
            }),
          });
        } catch {
          // ignore
        }
        return true;
      }
      if (config.provider === 'zapi') {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.zapiClientToken) headers['Client-Token'] = config.zapiClientToken;
        await fetch(`${baseUrl}/instances/${instance}/token/${config.apiKey}/disconnect`, {
          method: 'GET',
          headers,
        });
        return true;
      }
      return true;
    } catch {
      return false;
    }
  },
};
