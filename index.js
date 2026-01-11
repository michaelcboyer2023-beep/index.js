// Cloudflare Worker - Cloudflare Workers AI Image Generation
// Free, high-quality image generation using Cloudflare's own AI infrastructure
// Uses Stable Diffusion XL model
// ES Modules format (required for Cloudflare Workers)
// Version: 2025-01-11 - Initial Cloudflare Workers AI integration

import { Ai } from '@cloudflare/ai'

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env).catch(error => {
      return new Response(JSON.stringify({ 
        error: 'Worker error: ' + (error.message || 'Unknown error'),
        type: error.name || 'Error',
        details: error.stack || 'No stack trace'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    })
  }
}

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // POST request: Generate image via Cloudflare Workers AI
  if (request.method === 'POST') {
    return await generateImage(request, env)
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  })
}

async function generateImage(request, env) {
  try {
    // Check if AI binding is available
    if (!env.AI) {
      return new Response(JSON.stringify({ 
        error: 'AI binding not configured. Please bind the AI service in your Worker settings.',
        details: 'Go to Workers & Pages > Your Worker > Settings > Variables and Environment Variables > Add binding > Select "AI"',
        help: 'The AI binding must be added in the Worker settings for this to work.'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    let body
    try {
      body = await request.json()
    } catch (e) {
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body',
        details: e.message
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const { prompt } = body

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Use Cloudflare AI (already imported at top)
    const ai = new Ai(env.AI)

    // Generate image using Stable Diffusion XL (high quality)
    const inputs = {
      prompt: prompt.trim(),
      num_steps: 20, // Good balance of quality and speed (20-50 range)
      guidance_scale: 7.5, // Standard guidance scale (7-8 range)
      strength: 0.8, // Image strength
    }

    // Use Stable Diffusion XL for best quality
    // Alternative models available:
    // - @cf/stabilityai/stable-diffusion-xl-base-1.0 (best quality)
    // - @cf/bytedance/stable-diffusion-xl-lightning (faster)
    // - @cf/runwayml/stable-diffusion-v1-5-img2img (for image-to-image)
    const response = await ai.run(
      '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      inputs
    )

    // Convert the image response to base64 data URL
    const imageBuffer = await response.arrayBuffer()
    const bytes = new Uint8Array(imageBuffer)
    let binary = ''
    const chunkSize = 8192 // Process in chunks to avoid stack overflow
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize)
      const chunkArray = Array.from(chunk)
      binary += String.fromCharCode.apply(null, chunkArray)
    }
    const base64 = btoa(binary)
    const dataUrl = `data:image/png;base64,${base64}`

    // Success - return image URL
    return new Response(JSON.stringify({ 
      imageUrl: dataUrl,
      provider: 'cloudflare-ai',
      status: 'completed',
      version: '2025-01-11-cloudflare-ai'
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error) {
    // Provide detailed error information for debugging
    const errorDetails = {
      message: error.message || 'Unknown error occurred',
      type: error.name || 'Error',
      stack: error.stack || 'No stack trace',
      // Check common issues
      hasAI: !!env.AI,
      errorString: String(error)
    }
    
    return new Response(JSON.stringify({ 
      error: errorDetails.message,
      type: errorDetails.type,
      status: 'error',
      details: errorDetails,
      help: !env.AI ? 'AI binding not configured. Add AI binding in Worker Settings > Variables > Add binding > Select "AI"' : 'Check error details above'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
