const axios = require('axios')
const youtubeEndpoint = 'https://www.youtube.com'

const initializeYoutube = async (url) => {
  const page = await axios.get(encodeURI(url))
  const data = page.data.split('var ytInitialData =')[1].split('</script>')[0].slice(0, -1)
  let apiToken = null
  if (page.data.split('innertubeApiKey').length > 0) {
    apiToken = page.data.split('innertubeApiKey')[1].trim().split(',')[0].split('"')[2]
  }
  let context = null
  if (page.data.split('INNERTUBE_CONTEXT').length > 0) {
    context = JSON.parse(page.data.split('INNERTUBE_CONTEXT')[1].trim().slice(2, -2))
  }

  const initData = JSON.parse(data)
  return { initData, apiToken, context }
}

const formatTimestampSeconds = (str) => {
  const tokens = str.split(':')
  let total = 0
  for (let i = tokens.length - 1; i >= 0; i--) {
    total += parseInt(tokens[tokens.length - i - 1]) * Math.pow(60, i)
  }
  return total
}

const parseVideoData = async (json) => {
  const videoRenderer = json.videoRenderer
  return {
    id: videoRenderer.videoId,
    type: 'video',
    link: `${youtubeEndpoint}/watch?v=${videoRenderer.videoId}`,
    thumbnail: videoRenderer.thumbnail,
    title: videoRenderer.title.runs[0].text,
    channelTitle: videoRenderer.ownerText.runs[0].text,
    duration: {
      seconds: formatTimestampSeconds(videoRenderer.lengthText.simpleText),
      text: videoRenderer.lengthText.simpleText
    }
  }
}

exports.byKeyword = async (query) => {
  const page = await initializeYoutube(`${youtubeEndpoint}/results?search_query=${query}`)
  const sectionListRenderer = page.initData.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer
  const items = []
  for (const content of sectionListRenderer.contents) {
    if (content.itemSectionRenderer) {
      for (const item of content.itemSectionRenderer.contents) {
        if (item.videoRenderer && item.videoRenderer.videoId) {
          items.push(await parseVideoData(item))
        }
      }
    }
  }
  return items
}
