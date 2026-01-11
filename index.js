/ ULTRA SIMPLE TEST - This should always work
addEventListener('fetch', event => {
  event.respondWith(new Response(JSON.stringify({ 
    imageUrl: 'https://via.placeholder.com/512/FF0000/FFFFFF?text=Test+Works'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  }))
})
