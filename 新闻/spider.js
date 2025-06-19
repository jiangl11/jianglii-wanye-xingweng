const axios = require('axios');
const Parser = require('rss-parser');
const { extract } = require('@extractus/article-extractor');

const parser = new Parser();

/**
 * 获取新闻列表（支持RSS或API返回的JSON数组）
 * @param {string} sourceUrl 新闻来源URL
 * @returns {Promise<Array<{title, link, pubDate}>>}
 */
async function fetchNewsList(sourceUrl) {
    // RSS
    if (sourceUrl.endsWith('.xml') || sourceUrl.includes('rss')) {
        const feed = await parser.parseURL(sourceUrl);
        return feed.items.map(item => ({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate
        }));
    }
    // 假设API返回JSON数组
    const resp = await axios.get(sourceUrl);
    if (Array.isArray(resp.data)) {
        return resp.data.map(item => ({
            title: item.title,
            link: item.url || item.link,
            pubDate: item.pubDate || item.date
        }));
    }
    throw new Error('不支持的新闻源格式');
}

/**
 * 提取新闻正文
 * @param {string} url 新闻详情页URL
 * @returns {Promise<{title, content, published, url}>}
 */
async function fetchNewsContent(url) {
    const result = await extract(url);
    if (!result || !result.content) {
        throw new Error('正文提取失败');
    }
    return {
        title: result.title,
        content: result.content, // HTML格式正文
        published: result.published,
        url: url
    };
}

/**
 * 主流程：批量抓取新闻正文
 * @param {string} sourceUrl 新闻来源URL
 */
async function crawlNewsSource(sourceUrl) {
    const newsList = await fetchNewsList(sourceUrl);
    const results = [];
    for (const news of newsList) {
        try {
            const detail = await fetchNewsContent(news.link);
            results.push({
                ...news,
                ...detail
            });
            console.log(`✔ 抓取成功: ${news.title}`);
        } catch (e) {
            console.warn(`✖ 抓取失败: ${news.title} (${news.link})`);
        }
    }
    return results;
}

// 示例用法
(async () => {
    const sourceUrl = 'https://news.cctv.com/rss/rollnews.xml'; // 替换为你的新闻来源
    const allNews = await crawlNewsSource(sourceUrl);
    // 输出结构化JSON
    require('fs').writeFileSync('news_result.json', JSON.stringify(allNews, null, 2), 'utf-8');
    console.log('全部抓取完成，结果已保存到 news_result.json');
})();
