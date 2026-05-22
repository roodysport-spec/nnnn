import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as djtw from "https://deno.land/x/djwt@v2.8/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { topic, title, body, data } = await req.json()

    // Get Firebase secrets
    const privateKey = Deno.env.get('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n')
    const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL')
    const projectId = Deno.env.get('FIREBASE_PROJECT_ID')

    if (!privateKey || !clientEmail || !projectId) {
      throw new Error('Missing Firebase configuration secrets')
    }

    // 1. Generate JWT for Google Auth
    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 3600
    const jwtPayload = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp,
      iat,
    }

    const pemHeader = "-----BEGIN PRIVATE KEY-----"
    const pemFooter = "-----END PRIVATE KEY-----"
    let pemContents = privateKey
    if (privateKey.includes(pemHeader) && privateKey.includes(pemFooter)) {
      pemContents = privateKey.substring(
        privateKey.indexOf(pemHeader) + pemHeader.length,
        privateKey.indexOf(pemFooter)
      )
    }
    pemContents = pemContents
      .replace(pemHeader, "")
      .replace(pemFooter, "")
      .replace(/\\n/g, "")
      .replace(/\s/g, "")

    const binaryDerString = atob(pemContents)
    const binaryDer = new Uint8Array(binaryDerString.length)
    for (let i = 0; i < binaryDerString.length; i++) {
      binaryDer[i] = binaryDerString.charCodeAt(i)
    }

    const key = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    )

    const jwt = await djtw.create({ alg: 'RS256', typ: 'JWT' }, jwtPayload, key)

    // 2. Get Access Token from Google
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    })
    const { access_token } = await tokenRes.json()

    const sendMessage = async (target: { topic?: string; token?: string }) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            ...target,
            notification: { title, body },
            data: data || { click_action: "FLUTTER_NOTIFICATION_CLICK" },
            webpush: {
              notification: {
                title,
                body,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                dir: 'rtl',
                lang: 'ar',
              }
            }
          },
        }),
      })
      return res.json()
    }

    const results: unknown[] = []

    // 3a. إرسال لـ Topic (Android/iOS)
    if (topic) {
      const topicResult = await sendMessage({ topic })
      results.push({ target: `topic:${topic}`, result: topicResult })
    }

    // 3b. إرسال لكل الـ Tokens المحفوظة في Supabase (Android, iOS, Web)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (supabaseUrl && supabaseKey) {
      const sbAdmin = createClient(supabaseUrl, supabaseKey)
      const { data: tokens } = await sbAdmin.from('push_tokens').select('token')
      
      if (tokens && tokens.length > 0) {
        const tokenResults = await Promise.allSettled(
          tokens.map(({ token }: { token: string }) => sendMessage({ token }))
        )
        results.push({ target: 'device_tokens', count: tokens.length, results: tokenResults })
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Function Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
