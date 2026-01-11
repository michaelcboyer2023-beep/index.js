// Cloudflare Worker - AI Horde (Stable Horde) Text-to-Image Generation
// Free, anonymous access with API key "0000000000"
// Hybrid approach: POST submits request, GET checks status (avoids timeout)
// ES Modules format (required for Cloudflare Workers)

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request).catch(error => {
      return new Response(JSON.stringify({ 
        error: 'Worker error: ' + (error.message || 'Unknown error'),
        type: error.name || 'Error'
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

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  const url = new URL(request.url)
  const requestId = url.searchParams.get('requestId')
  
  // GET request: Check status of existing request
  if (request.method === 'GET' && requestId) {
    return await checkStatus(requestId)
  }
  
  // POST request: Submit new generation request
  if (request.method === 'POST') {
    return await submitRequest(request)
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  })
}

async function submitRequest(request) {
  try {
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

    // AI Horde API - Anonymous access with API key "0000000000"
    const apiKey = "0000000000" // Anonymous API key
    
    // Submit generation request
    const submitResponse = await fetch('https://stablehorde.net/api/v2/generate/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        prompt: prompt.trim(),
        params: {
          width: 512,
          height: 512,
          steps: 20,
          n: 1,
        },
        models: ['stable_diffusion'],
        nsfw: false,
        trusted_workers: false,
        censor_nsfw: false,
      })
    })

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text()
      return new Response(JSON.stringify({ 
        error: `AI Horde submission failed: ${submitResponse.status}`,
        details: errorText
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const submitData = await submitResponse.json()
    const requestId = submitData.id

    if (!requestId) {
      return new Response(JSON.stringify({ 
        error: 'No request ID returned from AI Horde',
        details: JSON.stringify(submitData)
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Return request ID immediately - frontend will poll for status
    return new Response(JSON.stringify({ 
      requestId: requestId,
      status: 'submitted',
      provider: 'aihorde',
      message: 'Request submitted. Polling for result...'
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error occurred',
      type: error.name || 'Error'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}

async function checkStatus(requestId) {
  try {
    const apiKey = "0000000000" // Anonymous API key
    
    // Check status
    const statusResponse = await fetch(`https://stablehorde.net/api/v2/generate/check/${requestId}`, {
      headers: {
        'apikey': apiKey,
      }
    })

    if (!statusResponse.ok) {
      return new Response(JSON.stringify({ 
        error: `Failed to check status: ${statusResponse.status}`,
        status: 'error'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const statusData = await statusResponse.json()
    
    // Check if request failed
    if (statusData.faulted) {
      return new Response(JSON.stringify({ 
        error: 'Image generation failed on AI Horde',
        details: statusData.faulted,
        status: 'failed'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
    
    // If not done yet, return processing status
    if (!statusData.done) {
      const queuePosition = statusData.queue_position || 0
      const waitTime = statusData.wait_time || 0
      return new Response(JSON.stringify({ 
        status: 'processing',
        queuePosition: queuePosition,
        waitTime: waitTime,
        done: false
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
    
    // Done! Get the generated image
    const resultResponse = await fetch(`https://stablehorde.net/api/v2/generate/status/${requestId}`, {
      headers: {
        'apikey': apiKey,
      }
    })

    if (!resultResponse.ok) {
      return new Response(JSON.stringify({ 
        error: 'Failed to get generation result',
        details: `Status: ${resultResponse.status}`,
        status: 'error'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const resultData = await resultResponse.json()
    
    if (resultData.generations && resultData.generations.length > 0 && resultData.generations[0].img) {
      // Convert base64 image to data URL
      const base64Image = resultData.generations[0].img
      const dataUrl = `data:image/png;base64,${base64Image}`
      
      return new Response(JSON.stringify({ 
        imageUrl: dataUrl,
        provider: 'aihorde',
        status: 'completed'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    } else {
      return new Response(JSON.stringify({ 
        error: 'No image in generation result',
        details: JSON.stringify(resultData),
        status: 'error'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error occurred',
      type: error.name || 'Error',
      status: 'error'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
