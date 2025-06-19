// AI 新闻地图应用主脚本
class NewsMapApp {
    constructor() {
        this.map = null;
        this.markers = [];
        this.heatmapLayer = null;
        this.isHeatmapMode = false;
        this.isPlaying = false;
        this.currentDate = new Date();
        this.newsData = [];
        this.filteredData = [];
        this.selectedCategories = ['politics', 'economy', 'disaster', 'tech', 'sports'];
        this.heatThreshold = 10;
        this.playInterval = null;
        this.fastLoading = true; // 启用快速加载模式
        this.newsSources = []; // 新闻来源列表
        this.selectedSources = []; // 已选择的新闻来源
        this.aiApiUrl = '';
        this.aiApiKey = '';
        this.deepseekApiUrl = '';
        this.deepseekApiKey = '';
        this.deepseekModel = 'deepseek-chat';
        this.aiModel = 'gpt-3.5-turbo';
        this.aiPlatform = 'custom'; // 'custom' or 'siliconflow'
        this.contentParserApi = 'https://your-content-parser-api?url=';
        
        this.init();
    }

    init() {
        this.initMap();
        this.initEventListeners();
        this.updateUI();
        // 初始化时只显示加载方式选择弹窗，不自动加载数据
        this.selectedCategories = ['politics', 'economy', 'disaster', 'tech', 'sports'];
        this.heatThreshold = 10;
        this.showLoadPrompt();
        // 强制隐藏加载动画
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    // 初始化地图
    initMap() {
        // 创建地图实例（不设置maxBounds和maxBoundsViscosity，实现左右无缝衔接）
        this.map = L.map('map', {
            center: [35.8617, 104.1954], // 中国中心
            zoom: 4,
            zoomControl: false,
            attributionControl: false
        });

        // 只限制纬度（上下），不限制经度，实现上下铺满、左右循环
        const latBounds = L.latLngBounds([[-85, -180], [85, 180]]);
        const minZoom = this.map.getBoundsZoom(latBounds, false);
        this.map.setMinZoom(minZoom);
        this.map.setMaxBounds([[-85, -Infinity], [85, Infinity]]);

        // 添加地图图层（天地图矢量底图），去掉noWrap参数
        L.tileLayer('https://t{s}.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk=89e9a79b7fbf13dbae13c4137ade7230', {
            subdomains: ['0','1','2','3','4','5','6','7'],
            attribution: '© 天地图'
        }).addTo(this.map);

        // 添加缩放控件
        L.control.zoom({
            position: 'bottomright'
        }).addTo(this.map);

        // 创建热力图层
        this.heatmapLayer = L.heatLayer([], {
            radius: 25,
            blur: 15,
            maxZoom: 10,
            gradient: {
                0.4: '#93C5FD',
                0.6: '#FCD34D',
                0.8: '#F59E0B',
                1.0: '#DC2626'
            }
        });

        // 地图事件监听
        this.map.on('zoomend', () => {
            this.updateHeatmapRadius();
        });

        this.map.on('moveend', () => {
            this.updateVisibleMarkers();
            this.updateHeatmap(); // 拖动后自动刷新热力图
        });

        // 热力图模式下点击地图，弹出最近新闻详情
        this.map.on('click', (e) => {
            if (this.isHeatmapMode && this.filteredData.length > 0) {
                let minDist = Infinity;
                let nearestNews = null;
                this.filteredData.forEach(news => {
                    const dist = this.map.distance(e.latlng, L.latLng(news.lat, news.lng));
                    if (dist < minDist) {
                        minDist = dist;
                        nearestNews = news;
                    }
                });
                // 距离阈值（单位：米），避免点到空白区域也弹窗
                if (nearestNews && minDist < 50000) {
                    this.showNewsDetail(nearestNews);
                } else {
                    // 点击非热力图区域，关闭新闻详情面板
                    this.closeDetailPanel();
                }
            } else if (this.isHeatmapMode) {
                // 热力图模式下但没有数据时，也关闭详情面板
                this.closeDetailPanel();
            }
        });
    }

    // 初始化事件监听器
    initEventListeners() {
        // 主题切换
        const themeToggleBtn = document.getElementById('themeToggle');
        if (themeToggleBtn) themeToggleBtn.addEventListener('click', () => {
            this.toggleTheme();
        });

        // 顶部导航栏筛选器按钮
        const filterToggleBtn = document.getElementById('filterToggle');
        const filterPanel = document.getElementById('filterPanel');
        const filterOverlay = document.getElementById('filterOverlay');
        if (filterToggleBtn && filterPanel && filterOverlay) {
            filterToggleBtn.addEventListener('click', () => {
                filterPanel.classList.toggle('active');
                filterOverlay.classList.toggle('active');
                if (filterPanel.classList.contains('active')) {
                    filterPanel.focus && filterPanel.focus();
                }
            });
            filterOverlay.addEventListener('click', () => {
                filterPanel.classList.remove('active');
                filterOverlay.classList.remove('active');
            });
        }

        // ESC键关闭筛选器
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // 关闭筛选器
                if (filterPanel && filterOverlay && filterPanel.classList.contains('active')) {
                    filterPanel.classList.remove('active');
                    filterOverlay.classList.remove('active');
                }
                // 关闭新闻详情面板
                const detailPanel = document.getElementById('detailPanel');
                if (detailPanel && detailPanel.classList.contains('active')) {
                    this.closeDetailPanel();
                }
            }
        });

        // 详情面板控制
        const closeDetailPanelBtn = document.getElementById('closeDetailPanel');
        if (closeDetailPanelBtn) closeDetailPanelBtn.addEventListener('click', () => {
            this.closeDetailPanel();
        });

        // 热力图切换
        const heatmapToggleBtn = document.getElementById('heatmapToggle');
        if (heatmapToggleBtn) heatmapToggleBtn.addEventListener('click', () => {
            this.toggleHeatmap();
        });

        // 全屏控制
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        if (fullscreenBtn) fullscreenBtn.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // 筛选器事件
        document.querySelectorAll('.filter-option input').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateFilters();
            });
        });

        // 热度阈值滑块
        const heatThresholdSlider = document.getElementById('heatThreshold');
        if (heatThresholdSlider) heatThresholdSlider.addEventListener('input', (e) => {
            this.heatThreshold = parseInt(e.target.value);
            document.getElementById('thresholdValue').textContent = this.heatThreshold;
            this.updateFilters();
        });

        // 响应式面板控制
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // 全局点击事件：点击地图外区域关闭新闻详情面板
        document.addEventListener('click', (e) => {
            const detailPanel = document.getElementById('detailPanel');
            const mapContainer = document.querySelector('.map-container');
            
            // 如果详情面板是显示的，且点击的不是详情面板内部或地图区域，则关闭详情面板
            if (detailPanel && detailPanel.classList.contains('active') && 
                !detailPanel.contains(e.target) && 
                !mapContainer.contains(e.target)) {
                this.closeDetailPanel();
            }
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });

        // 关闭加载提示
        document.addEventListener('click', (e) => {
            if (e.target.id === 'closeLoadPrompt') {
                const prompt = document.getElementById('loadPrompt');
                if (prompt) {
                    prompt.style.display = 'none';
                }
            }
        });

        // 设置按钮
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) settingsBtn.addEventListener('click', () => {
            this.showSettingsPanel();
        });

        // 日期选择器事件
        const datePicker = document.getElementById('datePicker');
        if (datePicker) {
            datePicker.addEventListener('change', (e) => {
                const selectedDate = e.target.value;
                if (selectedDate) {
                    // 只保留当天新闻
                    this.filteredData = this.newsData.filter(news => {
                        const newsDate = news.timestamp;
                        // news.timestamp 可能是Date对象或字符串
                        const y = newsDate.getFullYear ? newsDate.getFullYear() : new Date(newsDate).getFullYear();
                        const m = newsDate.getMonth ? newsDate.getMonth() : new Date(newsDate).getMonth();
                        const d = newsDate.getDate ? newsDate.getDate() : new Date(newsDate).getDate();
                        const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                        return dateStr === selectedDate;
                    });
                } else {
                    // 未选日期则显示全部
                    this.filteredData = [...this.newsData];
                }
                this.renderMarkers();
            });
        }

        // 详情面板拖拽
        const detailPanel = document.getElementById('detailPanel');
        const resizeHandle = document.getElementById('detailResizeHandle');
        if (detailPanel && resizeHandle) {
            let isResizing = false;
            let startX = 0;
            let startWidth = 0;
            resizeHandle.addEventListener('mousedown', (e) => {
                isResizing = true;
                startX = e.clientX;
                startWidth = detailPanel.offsetWidth;
                document.body.style.cursor = 'ew-resize';
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                let newWidth = startWidth - (e.clientX - startX);
                newWidth = Math.max(280, Math.min(newWidth, window.innerWidth * 0.9));
                detailPanel.style.width = newWidth + 'px';
            });
            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                }
            });
        }
    }

    // 加载模拟数据
    loadMockData() {
        this.showLoading(true);
        const delay = this.fastLoading ? 200 : 500;
        setTimeout(() => {
            try {
                this.newsData = this.generateMockNewsData();
                this.filteredData = [...this.newsData];
                this.updateFilters();
                this.renderMarkers();
                this.showLoading(false);
                const mode = this.fastLoading ? '快速模式' : '普通模式';
                this.showNotification(`新闻数据加载完成 (${mode}, ${delay}ms)`, 'success');
                const prompt = document.getElementById('loadPrompt');
                if (prompt) {
                    prompt.style.display = 'none';
                }
            } catch (e) {
                this.showLoading(false);
                this.showNotification('新闻数据加载失败', 'error');
            }
        }, delay);
    }

    // 生成模拟新闻数据
    generateMockNewsData() {
        const categories = {
            politics: '政治',
            economy: '经济',
            disaster: '灾害',
            tech: '科技',
            sports: '体育'
        };

        const locations = [
            { name: '北京', lat: 39.9042, lng: 116.4074 },
            { name: '上海', lat: 31.2304, lng: 121.4737 },
            { name: '广州', lat: 23.1291, lng: 113.2644 },
            { name: '深圳', lat: 22.3193, lng: 114.1694 },
            { name: '杭州', lat: 30.2741, lng: 120.1551 },
            { name: '成都', lat: 30.5728, lng: 104.0668 },
            { name: '西安', lat: 34.3416, lng: 108.9398 },
            { name: '武汉', lat: 30.5928, lng: 114.3055 },
            { name: '南京', lat: 32.0603, lng: 118.7969 },
            { name: '重庆', lat: 29.4316, lng: 106.9123 },
            { name: '纽约', lat: 40.7128, lng: -74.0060 },
            { name: '伦敦', lat: 51.5074, lng: -0.1278 },
            { name: '东京', lat: 35.6762, lng: 139.6503 },
            { name: '巴黎', lat: 48.8566, lng: 2.3522 },
            { name: '莫斯科', lat: 55.7558, lng: 37.6176 },
            { name: '基辅', lat: 50.4501, lng: 30.5234 },
            { name: '旧金山', lat: 37.7749, lng: -122.4194 },
            { name: '新加坡', lat: 1.3521, lng: 103.8198 },
            { name: '悉尼', lat: -33.8688, lng: 151.2093 },
            { name: '多伦多', lat: 43.6532, lng: -79.3832 }
        ];

        const newsTitles = {
            politics: [
                '重要政策发布：新法规即将实施',
                '国际会议召开：多国领导人齐聚',
                '选举结果公布：新政府即将组建',
                '外交关系发展：双边合作深化',
                '政治改革推进：制度创新启动'
            ],
            economy: [
                '经济数据发布：GDP增长超预期',
                '股市表现强劲：主要指数创新高',
                '央行政策调整：利率变动影响市场',
                '贸易数据公布：进出口额增长',
                '投资环境改善：外资流入增加'
            ],
            disaster: [
                '自然灾害发生：救援工作展开',
                '极端天气预警：防范措施加强',
                '事故现场报道：伤亡情况更新',
                '救援进展通报：生命通道打通',
                '灾后重建启动：援助物资到位'
            ],
            tech: [
                '科技创新突破：新技术应用推广',
                '互联网发展：数字经济发展迅速',
                '人工智能进展：AI技术突破',
                '新能源技术：清洁能源发展',
                '数字化转型：企业升级改造'
            ],
            sports: [
                '体育赛事直播：精彩比赛进行中',
                '运动员表现：新纪录诞生',
                '体育产业发展：市场规模扩大',
                '体育文化交流：国际赛事举办',
                '体育设施建设：场馆改造升级'
            ]
        };

        const data = [];
        const now = new Date();
        
        locations.forEach((location, index) => {
            const category = Object.keys(categories)[Math.floor(Math.random() * 5)];
            const titles = newsTitles[category];
            const title = titles[Math.floor(Math.random() * titles.length)];
            const heat = Math.floor(Math.random() * 100) + 1;
            const hoursAgo = Math.floor(Math.random() * 24);
            const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

            // 经纬度有效性校验，防止lng/lat顺序错误
            let lat = location.lat + (Math.random() - 0.5) * 0.1;
            let lng = location.lng + (Math.random() - 0.5) * 0.1;
            if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
                // 发现顺序反了，自动交换
                [lat, lng] = [lng, lat];
            }
            data.push({
                id: `news_${index}`,
                title: title,
                category: category,
                categoryName: categories[category],
                location: location.name,
                lat: lat,
                lng: lng,
                heat: heat,
                timestamp: timestamp,
                summary: `这是一条关于${categories[category]}的新闻，发生在${location.name}地区。该新闻的热度值为${heat}，发布时间为${timestamp.toLocaleString()}。`,
                url: `https://example.com/news/${index}`,
                relatedNews: [
                    `相关新闻1：${location.name}地区${categories[category]}发展`,
                    `相关新闻2：${categories[category]}领域最新动态`,
                    `相关新闻3：国际${categories[category]}合作项目`
                ]
            });
        });

        return data;
    }

    // 渲染标记点
    renderMarkers() {
        this.showLoading(false);
        this.clearMarkers(); // 可选，保留清除旧marker逻辑
        // 不再创建marker，只刷新热力图
        this.updateHeatmap();
    }

    // 清除标记
    clearMarkers() {
        this.markers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.markers = [];
    }

    // 更新热力图
    updateHeatmap() {
        if (this.isHeatmapMode) {
            // 计算带缓冲的地图边界（扩大1.5倍）
            const bounds = this.map.getBounds();
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            const latBuffer = (ne.lat - sw.lat) * 0.25;
            const lngBuffer = (ne.lng - sw.lng) * 0.25;
            const bufferedBounds = L.latLngBounds(
                [sw.lat - latBuffer, sw.lng - lngBuffer],
                [ne.lat + latBuffer, ne.lng + lngBuffer]
            );
            const centerLng = this.map.getCenter().lng;
            const mainOffset = Math.round(centerLng / 360) * 360;
            const offsets = [mainOffset - 360, mainOffset, mainOffset + 360];
            const heatData = [];
            const pointSet = new Set();
            this.filteredData.forEach(news => {
                offsets.forEach(offset => {
                    const lng = news.lng + offset;
                    const key = `${news.lat.toFixed(6)},${lng.toFixed(6)}`;
                    if (bufferedBounds.contains([news.lat, lng]) && !pointSet.has(key)) {
                        heatData.push([news.lat, lng, news.heat]);
                        pointSet.add(key);
                    }
                });
            });
            this.heatmapLayer.setLatLngs(heatData);
            if (!this.map.hasLayer(this.heatmapLayer)) {
                this.heatmapLayer.addTo(this.map);
            }
        } else {
            this.map.removeLayer(this.heatmapLayer);
        }
    }

    // 更新热力图半径
    updateHeatmapRadius() {
        const zoom = this.map.getZoom();
        const radius = Math.max(15, 50 - zoom * 3);
        this.heatmapLayer.setOptions({ radius: radius });
    }

    // 更新可见标记
    updateVisibleMarkers() {
        const bounds = this.map.getBounds();
        this.markers.forEach(marker => {
            const pos = marker.getLatLng();
            const isVisible = bounds.contains(pos);
            const icon = marker.getElement();
            if (icon) {
                icon.style.opacity = isVisible ? '1' : '0.3';
            }
        });
    }

    // 切换热力图模式
    toggleHeatmap() {
        this.isHeatmapMode = !this.isHeatmapMode;
        const btn = document.getElementById('heatmapToggle');
        if (this.isHeatmapMode) {
            btn.classList.add('active');
            // 彻底移除旧图层并新建
            if (this.map.hasLayer(this.heatmapLayer)) {
                this.map.removeLayer(this.heatmapLayer);
            }
            // 重新创建热力图图层
            this.heatmapLayer = L.heatLayer(
                this.filteredData.map(news => [news.lat, news.lng, news.heat]),
                {
                    radius: 25,
                    blur: 15,
                    maxZoom: 10,
                    gradient: {
                        0.4: '#93C5FD',
                        0.6: '#FCD34D',
                        0.8: '#F59E0B',
                        1.0: '#DC2626'
                    }
                }
            ).addTo(this.map);
            this.updateHeatmap(); // 切换热力图时刷新内容
        } else {
            btn.classList.remove('active');
            if (this.map.hasLayer(this.heatmapLayer)) {
                this.map.removeLayer(this.heatmapLayer);
            }
        }
    }

    // 切换主题
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        
        // 保存主题偏好
        localStorage.setItem('theme', newTheme);
        
        this.showNotification(`已切换到${newTheme === 'dark' ? '暗黑' : '明亮'}模式`, 'success');
    }

    // 切换全屏
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    // 更新筛选器
    updateFilters() {
        // 只保留分类和热度筛选逻辑，删除地区订阅相关
        this.filteredData = this.newsData.filter(news => {
            const categoryMatch = this.selectedCategories.includes(news.category);
            const heatMatch = news.heat >= this.heatThreshold;
            return categoryMatch && heatMatch;
        });
        this.updateHeatmap();
    }

    // 处理键盘快捷键
    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + F: 打开筛选器
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            this.toggleFilterPanel();
        }
        
        // Ctrl/Cmd + H: 切换热力图
        if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
            e.preventDefault();
            this.toggleHeatmap();
        }
        
        // Ctrl/Cmd + D: 切换主题
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            this.toggleTheme();
        }
        
        // Ctrl/Cmd + R: 重新加载数据
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            this.reloadData();
        }
        
        // 空格键: 播放/暂停
        if (e.key === ' ' && e.target === document.body) {
            e.preventDefault();
            this.togglePlayback();
        }
        
        // ESC: 关闭面板
        if (e.key === 'Escape') {
            this.closeFilterPanel();
            this.closeDetailPanel();
        }
    }

    // 处理窗口大小变化
    handleResize() {
        if (this.map) {
            this.map.invalidateSize();
        }
    }

    // 显示加载状态
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = show ? 'flex' : 'none';
    }

    // 显示通知
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    // 更新UI
    updateUI() {
        // 恢复主题
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        // 恢复快速加载设置
        const savedFastLoading = localStorage.getItem('fastLoading');
        if (savedFastLoading !== null) {
            this.fastLoading = savedFastLoading === 'true';
        }
        // 加载新闻来源
        this.loadNewsSources();
        // 更新热度阈值显示
        document.getElementById('thresholdValue').textContent = this.heatThreshold;
        // 恢复AI接口配置
        const savedModel = localStorage.getItem('aiModel');
        if (savedModel) this.aiModel = savedModel;
        // 恢复平台选择
        const savedPlatform = localStorage.getItem('aiPlatform');
        if (savedPlatform) this.aiPlatform = savedPlatform;
    }

    // 显示设置面板
    showSettingsPanel() {
        const settingsHTML = `
            <div class="settings-overlay" id="settingsOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:3000;background:rgba(0,0,0,0.18);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;">
                <div class="settings-panel" style="position:fixed;top:64px;left:50%;transform:translateX(-50%,0);z-index:3100;max-width:540px;width:95vw;background:#fff;border-radius:18px;box-shadow:0 8px 32px rgba(0,0,0,0.18);padding:0;overflow:hidden;">
                    <div class="panel-header" style="padding:1.5em 2em 1em 2em;background:inherit;border-bottom:1px solid #eee;position:relative;">
                        <h3 style="margin:0 auto;text-align:center;font-size:1.4em;font-weight:700;letter-spacing:0.04em;">设置</h3>
                        <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()" style="position:absolute;top:18px;right:18px;background:none;border:none;font-size:1.5em;color:#888;cursor:pointer;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.2em;height:1.2em;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                    <div class="settings-content" style="padding:2em 2em 1.5em 2em;">
                        <div class="setting-item" style="margin-bottom:2em;">
                            <label style="display:flex;align-items:center;gap:0.7em;">
                                <input type="checkbox" id="fastLoadingToggle" ${this.fastLoading ? 'checked' : ''}>
                                <span class="setting-label" style="font-weight:500;">快速加载模式</span>
                            </label>
                            <p class="setting-description" style="color:#888;font-size:0.98em;margin:0.5em 0 0 2.1em;">启用后新闻数据加载速度更快</p>
                        </div>
                        <hr style="border:none;border-top:1px solid #eee;margin:1.5em 0;">
                        <div class="setting-item" style="margin-bottom:2em;">
                            <h4 style="font-size:1.08em;font-weight:600;margin-bottom:0.7em;letter-spacing:0.01em;">新闻来源配置</h4>
                            <div class="news-sources-container">
                                <div class="sources-list" id="sourcesList" style="margin-bottom:0.7em;"></div>
                                <div class="add-source-form" style="gap:0.5em;">
                                    <input type="text" id="sourceName" placeholder="新闻来源名称" class="source-input">
                                    <input type="text" id="sourceUrl" placeholder="API地址或RSS链接" class="source-input">
                                    <button class="btn btn-sm btn-primary" onclick="app.addNewsSource()">添加来源</button>
                                </div>
                            </div>
                        </div>
                        <hr style="border:none;border-top:1px solid #eee;margin:1.5em 0;">
                        <div class="setting-item">
                            <h4 style="font-size:1.08em;font-weight:600;margin-bottom:0.7em;letter-spacing:0.01em;">AI接口配置</h4>
                            <div style="margin-bottom:0.7em;display:flex;gap:2em;align-items:center;">
                                <label style="display:flex;align-items:center;gap:0.4em;font-weight:500;">
                                    <input type="radio" name="aiPlatform" id="aiPlatformCustom" value="custom" ${this.aiPlatform==='custom'?'checked':''}>
                                    自定义API
                                </label>
                                <label style="display:flex;align-items:center;gap:0.4em;font-weight:500;">
                                    <input type="radio" name="aiPlatform" id="aiPlatformSilicon" value="siliconflow" ${this.aiPlatform==='siliconflow'?'checked':''}>
                                    SiliconFlow DeepSeek-R1-0528-Qwen3-8B
                                </label>
                            </div>
                            <div class="ai-api-config" style="gap:0.5em;align-items:flex-end;flex-wrap:wrap;">
                                <input type="text" id="aiApiUrl" placeholder="OpenAI API地址" class="source-input" style="min-width:0;flex:2;">
                                <input type="text" id="aiApiKey" placeholder="OpenAI API Key（可选）" class="source-input" style="min-width:0;flex:2;">
                                <input type="text" id="aiModel" placeholder="模型名称（如gpt-3.5-turbo）" class="source-input" style="min-width:0;flex:1.5;">
                                <button class="btn btn-sm btn-secondary" id="testAiApiBtn" style="margin-left:0.5em;white-space:nowrap;">连接测试</button>
                            </div>
                        </div>
                        <div class="setting-actions" style="margin-top:2.2em;display:flex;gap:1em;justify-content:center;">
                            <button class="btn btn-primary" onclick="app.applySettings()">应用设置</button>
                            <button class="btn btn-secondary" onclick="app.reloadData()">重新加载数据</button>
                            <button class="btn btn-success" onclick="app.instantLoadData()">即时加载</button>
                            <button class="btn btn-warning" onclick="app.showLoadPrompt()">显示加载选项</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 移除现有的设置面板
        const existingOverlay = document.getElementById('settingsOverlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        // 添加新的设置面板
        document.body.insertAdjacentHTML('beforeend', settingsHTML);
        
        // 添加设置面板的样式
        const style = document.createElement('style');
        style.textContent = `
            .settings-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                backdrop-filter: blur(4px);
            }
            
            .settings-panel {
                background-color: var(--bg-primary);
                border-radius: var(--radius-lg);
                box-shadow: var(--shadow-xl);
                width: 90%;
                max-width: 500px;
                max-height: 80vh;
                overflow-y: auto;
            }
            
            .settings-content {
                padding: var(--spacing-lg);
            }
            
            .setting-item {
                margin-bottom: var(--spacing-lg);
            }
            
            .setting-item label {
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
                cursor: pointer;
                margin-bottom: var(--spacing-xs);
            }
            
            .setting-item input[type="checkbox"] {
                width: 1.25rem;
                height: 1.25rem;
            }
            
            .setting-label {
                font-weight: 500;
                color: var(--text-primary);
            }
            
            .setting-description {
                font-size: var(--font-size-sm);
                color: var(--text-secondary);
                margin-left: 2rem;
            }
            
            .setting-actions {
                display: flex;
                gap: var(--spacing-sm);
                margin-top: var(--spacing-lg);
            }
        `;
        
        if (!document.getElementById('settingsStyles')) {
            style.id = 'settingsStyles';
            document.head.appendChild(style);
        }
        
        // 更新新闻来源UI
        this.updateNewsSourcesUI();
        // 平台切换逻辑
        setTimeout(() => {
            const radioCustom = document.getElementById('aiPlatformCustom');
            const radioSilicon = document.getElementById('aiPlatformSilicon');
            const urlInput = document.getElementById('aiApiUrl');
            const keyInput = document.getElementById('aiApiKey');
            const modelInput = document.getElementById('aiModel');
            // 预设SiliconFlow参数
            const siliconUrl = 'https://api.siliconflow.cn/v1/chat/completions';
            const siliconModel = 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B';
            // 初始化
            if (this.aiPlatform === 'siliconflow') {
                urlInput.value = siliconUrl;
                urlInput.disabled = true;
                modelInput.value = siliconModel;
                modelInput.disabled = true;
            } else {
                urlInput.disabled = false;
                modelInput.disabled = false;
            }
            // 切换事件
            if (radioCustom) radioCustom.onchange = () => {
                urlInput.disabled = false;
                modelInput.disabled = false;
                this.aiPlatform = 'custom';
            };
            if (radioSilicon) radioSilicon.onchange = () => {
                urlInput.value = siliconUrl;
                urlInput.disabled = true;
                modelInput.value = siliconModel;
                modelInput.disabled = true;
                this.aiPlatform = 'siliconflow';
            };
        }, 0);
        // 绑定AI接口连接测试按钮
        setTimeout(() => {
            const testBtn = document.getElementById('testAiApiBtn');
            if (testBtn) {
                testBtn.onclick = async () => {
                    const url = document.getElementById('aiApiUrl').value.trim();
                    const key = document.getElementById('aiApiKey').value.trim();
                    const model = document.getElementById('aiModel').value.trim() || 'gpt-3.5-turbo';
                    if (!url || !key) {
                        this.showNotification('请填写API地址和Key', 'error');
                        return;
                    }
                    testBtn.disabled = true;
                    testBtn.textContent = '测试中...';
                    try {
                        const resp = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${key}`
                            },
                            body: JSON.stringify({
                                model: model,
                                messages: [
                                    { role: 'system', content: '你是一个AI助手' },
                                    { role: 'user', content: '你好' }
                                ],
                                temperature: 0.1
                            })
                        });
                        const contentType = resp.headers.get('content-type') || '';
                        if (contentType.includes('application/json')) {
                            const data = await resp.json();
                            if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
                                this.showNotification('AI接口连接成功', 'success');
                            } else {
                                this.showNotification('AI接口连接失败：' + (data.error?.message || '无返回'), 'error');
                            }
                        } else {
                            const text = await resp.text();
                            this.showNotification('AI接口返回非JSON内容：' + text.slice(0, 120), 'error');
                        }
                    } catch (err) {
                        this.showNotification('AI接口连接异常：' + err.message, 'error');
                    }
                    testBtn.disabled = false;
                    testBtn.textContent = '连接测试';
                };
            }
        }, 0);
    }

    // 应用设置
    applySettings() {
        const fastLoadingToggle = document.getElementById('fastLoadingToggle');
        this.fastLoading = fastLoadingToggle.checked;
        // AI接口配置
        this.aiApiUrl = document.getElementById('aiApiUrl').value.trim();
        this.aiApiKey = document.getElementById('aiApiKey').value.trim();
        localStorage.setItem('aiApiUrl', this.aiApiUrl);
        localStorage.setItem('aiApiKey', this.aiApiKey);
        // 保存设置到本地存储
        localStorage.setItem('fastLoading', this.fastLoading);
        this.showNotification('设置已保存', 'success');
        // 关闭设置面板
        const overlay = document.getElementById('settingsOverlay');
        if (overlay) {
            overlay.remove();
        }
        // 保存平台选择
        const radioSilicon = document.getElementById('aiPlatformSilicon');
        this.aiPlatform = radioSilicon && radioSilicon.checked ? 'siliconflow' : 'custom';
        localStorage.setItem('aiPlatform', this.aiPlatform);
    }

    // 重新加载数据
    reloadData() {
        this.loadMockData();
        
        // 关闭设置面板
        const overlay = document.getElementById('settingsOverlay');
        if (overlay) {
            overlay.remove();
        }
    }

    // 即时加载数据（无延迟）
    instantLoadData() {
        this.newsData = this.generateMockNewsData();
        this.filteredData = [...this.newsData];
        this.updateFilters();
        // 自动切换到热力图模式
        if (!this.isHeatmapMode) {
            this.isHeatmapMode = true;
            const heatmapToggleBtn = document.getElementById('heatmapToggle');
            if (heatmapToggleBtn) heatmapToggleBtn.classList.add('active');
        }
        this.updateHeatmap();
        // 隐藏加载提示
        const prompt = document.getElementById('loadPrompt');
        if (prompt) {
            prompt.style.display = 'none';
        }
        // 隐藏加载动画
        this.showLoading(false);
    }

    // 显示加载提示
    showLoadPrompt() {
        const prompt = document.getElementById('loadPrompt');
        if (prompt) {
            prompt.style.display = 'flex';
        }
        // 强制隐藏加载动画
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    // 慢速加载数据
    loadMockDataSlow() {
        this.showLoading(true);
        
        // 模拟较慢的网络环境
        setTimeout(() => {
            this.newsData = this.generateMockNewsData();
            this.filteredData = [...this.newsData];
            this.updateFilters();
            // 自动切换到热力图模式
            if (!this.isHeatmapMode) {
                this.isHeatmapMode = true;
                const heatmapToggleBtn = document.getElementById('heatmapToggle');
                if (heatmapToggleBtn) heatmapToggleBtn.classList.add('active');
            }
            this.updateHeatmap();
            this.showLoading(false);
            this.showNotification('新闻数据加载完成 (普通模式, 500ms)', 'success');
            
            // 隐藏加载提示
            const prompt = document.getElementById('loadPrompt');
            if (prompt) {
                prompt.style.display = 'none';
            }
        }, 500);
    }

    // 添加新闻来源
    addNewsSource() {
        const nameInput = document.getElementById('sourceName');
        const urlInput = document.getElementById('sourceUrl');
        
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();
        
        if (!name || !url) {
            this.showNotification('请填写完整的新闻来源信息', 'error');
            return;
        }
        
        // 检查是否已存在
        if (this.newsSources.some(source => source.name === name)) {
            this.showNotification('该新闻来源已存在', 'error');
            return;
        }
        
        const newSource = {
            id: `source_${Date.now()}`,
            name: name,
            url: url,
            enabled: true,
            type: this.detectSourceType(url)
        };
        
        this.newsSources.push(newSource);
        this.selectedSources.push(newSource.id);
        
        // 保存到本地存储
        this.saveNewsSources();
        
        // 更新UI
        this.updateNewsSourcesUI();
        
        // 清空输入框
        nameInput.value = '';
        urlInput.value = '';
        
        this.showNotification(`已添加新闻来源: ${name}`, 'success');
    }

    // 删除新闻来源
    removeNewsSource(sourceId) {
        const source = this.newsSources.find(s => s.id === sourceId);
        if (source) {
            this.newsSources = this.newsSources.filter(s => s.id !== sourceId);
            this.selectedSources = this.selectedSources.filter(id => id !== sourceId);
            
            // 保存到本地存储
            this.saveNewsSources();
            
            // 更新UI
            this.updateNewsSourcesUI();
            
            this.showNotification(`已删除新闻来源: ${source.name}`, 'success');
        }
    }

    // 切换新闻来源状态
    toggleNewsSource(sourceId) {
        const source = this.newsSources.find(s => s.id === sourceId);
        if (source) {
            source.enabled = !source.enabled;
            
            if (source.enabled) {
                if (!this.selectedSources.includes(sourceId)) {
                    this.selectedSources.push(sourceId);
                }
            } else {
                this.selectedSources = this.selectedSources.filter(id => id !== sourceId);
            }
            
            // 保存到本地存储
            this.saveNewsSources();
            
            // 更新UI
            this.updateNewsSourcesUI();
        }
    }

    // 检测新闻来源类型
    detectSourceType(url) {
        if (url.includes('rss') || url.includes('feed')) {
            return 'rss';
        } else if (url.includes('api')) {
            return 'api';
        } else {
            return 'unknown';
        }
    }

    // 更新新闻来源UI
    updateNewsSourcesUI() {
        const sourcesList = document.getElementById('sourcesList');
        if (!sourcesList) return;
        
        if (this.newsSources.length === 0) {
            sourcesList.innerHTML = '<p class="no-sources">暂无配置的新闻来源</p>';
            return;
        }
        
        sourcesList.innerHTML = this.newsSources.map(source => `
            <div class="source-item">
                <div class="source-info">
                    <label class="source-toggle">
                        <input type="checkbox" ${source.enabled ? 'checked' : ''} 
                               onchange="app.toggleNewsSource('${source.id}')">
                        <span class="source-name">${source.name}</span>
                    </label>
                    <span class="source-type">${source.type.toUpperCase()}</span>
                </div>
                <div class="source-actions">
                    <button class="btn btn-sm btn-secondary" onclick="app.testNewsSource('${source.id}')" title="测试连接">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                        </svg>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="app.removeNewsSource('${source.id}')" title="删除">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // 测试新闻来源连接
    testNewsSource(sourceId) {
        const source = this.newsSources.find(s => s.id === sourceId);
        if (!source) return;
        
        this.showNotification(`正在测试连接: ${source.name}...`, 'info');
        
        // 模拟测试连接
        setTimeout(() => {
            const success = Math.random() > 0.3; // 70%成功率
            if (success) {
                this.showNotification(`连接成功: ${source.name}`, 'success');
            } else {
                this.showNotification(`连接失败: ${source.name}`, 'error');
            }
        }, 1000);
    }

    // 保存新闻来源到本地存储
    saveNewsSources() {
        localStorage.setItem('newsSources', JSON.stringify(this.newsSources));
        localStorage.setItem('selectedSources', JSON.stringify(this.selectedSources));
    }

    // 从本地存储加载新闻来源
    loadNewsSources() {
        const savedSources = localStorage.getItem('newsSources');
        const savedSelected = localStorage.getItem('selectedSources');
        
        if (savedSources) {
            this.newsSources = JSON.parse(savedSources);
        }
        
        if (savedSelected) {
            this.selectedSources = JSON.parse(savedSelected);
        }
        
        // 如果没有任何来源，添加央视新闻
        if (!this.newsSources || this.newsSources.length === 0) {
            const cctv = {
                id: 'source_cctv',
                name: '央视新闻',
                url: 'https://news.cctv.com/rss/rollnews.xml',
                enabled: false,
                type: 'rss'
            };
            this.newsSources = [cctv];
            this.selectedSources = [];
            this.saveNewsSources();
        }
    }

    // 获取新闻正文内容，优先缓存
    async getNewsContent(news) {
        if (news.content && news.content.trim()) return news.content;
        const cacheKey = 'news_content_' + news.id;
        let cached = localStorage.getItem(cacheKey);
        if (cached) {
            news.content = cached;
            return cached;
        }
        if (!news.url) return '';
        try {
            const resp = await fetch(this.contentParserApi + encodeURIComponent(news.url));
            const data = await resp.json();
            if (data.content && data.content.trim()) {
                news.content = data.content.trim();
                localStorage.setItem(cacheKey, news.content);
                return news.content;
            }
        } catch (e) {}
        return '';
    }

    // 优化新闻详情展示逻辑
    async showNewsDetail(news) {
        const detailContent = document.getElementById('detailContent');
        const detailPanel = document.getElementById('detailPanel');
        if (detailPanel) {
            detailPanel.classList.add('active');
            detailPanel.style.display = 'block';
        }
        // 先尝试获取正文
        let content = await this.getNewsContent(news);
        // 只显示新闻概要（summary），不再自动拼接其他信息
        const summaryHtml = news.summary
            ? `<p>${news.summary.trim()}</p>`
            : '<p class="text-muted">暂无概要</p>';
        const imageHtml = news.imageUrl ? `<img src="${news.imageUrl}" alt="新闻配图" class="news-image" style="max-width:100%;border-radius:8px;margin-bottom:1em;">` : '';
        const sourceHtml = news.source ? `<span class="news-source">来源：${news.source}</span>` : '';
        let relatedHtml = '<p class="text-muted">暂无相关新闻</p>';
        if (Array.isArray(news.relatedNews) && news.relatedNews.length > 0) {
            relatedHtml = '<ul>' + news.relatedNews.map(related => {
                if (typeof related === 'object' && related.title && related.url) {
                    return `<li><a href="${related.url}" target="_blank">${related.title}</a></li>`;
                } else {
                    return `<li>${related}</li>`;
                }
            }).join('') + '</ul>';
        }
        // 原文内容容器
        const originalHtml = `<div id="originalArticle" style="display:none;background:#fff;padding:1em 0 0 0;"></div>`;
        detailContent.innerHTML = `
            <div class="news-card">
                ${imageHtml}
                <div class="news-header" style="margin-bottom:0.5em;">
                    <h2 class="news-title" style="font-size:1.5em;line-height:1.3;margin-bottom:0.2em;">${news.title}</h2>
                    <div class="news-meta" style="color:#888;font-size:0.95em;display:flex;flex-wrap:wrap;gap:1em;align-items:center;">
                        <span class="news-category">${news.categoryName}</span>
                        <span>📍 ${news.location}</span>
                        <span>🔥 热度: ${news.heat}</span>
                        <span>🕒 ${news.timestamp instanceof Date ? news.timestamp.toLocaleString() : news.timestamp}</span>
                        ${sourceHtml}
                    </div>
                </div>
                <hr style="margin:0.5em 0 1em 0;border:none;border-top:1px solid #eee;">
                <div class="news-summary" style="margin-bottom:1em;">${summaryHtml}</div>
                <div class="news-actions" style="margin-bottom:1em;display:flex;gap:1em;">
                    <button id="genSummaryBtn" class="btn btn-secondary">生成概括</button>
                    <button id="showOriginalBtn" class="btn btn-secondary">阅读原文</button>
                </div>
                <div class="related-news" style="margin-bottom:0.5em;">
                    <h4 style="margin-bottom:0.3em;">相关新闻</h4>
                    ${relatedHtml}
                </div>
                ${originalHtml}
            </div>
        `;
        // 生成概括按钮事件
        const genSummaryBtn = document.getElementById('genSummaryBtn');
        if (genSummaryBtn) {
            genSummaryBtn.onclick = async () => {
                const originalDiv = document.getElementById('originalArticle');
                if (!originalDiv) return;
                originalDiv.innerHTML = '<div style="color:#888;">AI正在生成概括...</div>';
                originalDiv.style.display = 'block';
                if (!content) content = await this.getNewsContent(news);
                if (!content) {
                    originalDiv.innerHTML = '<div style="color:#888;">暂无原文内容，无法生成概括。</div>';
                    return;
                }
                // AI生成概括
                try {
                    let aiSummary = '';
                    // 平台参数
                    let url = this.aiApiUrl;
                    let key = this.aiApiKey;
                    let model = this.aiModel || 'gpt-3.5-turbo';
                    if (this.aiPlatform === 'siliconflow') {
                        url = 'https://api.siliconflow.cn/v1/chat/completions';
                        model = 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B';
                    }
                    if (!url || !key) {
                        originalDiv.innerHTML = '<div style="color:#c00;">未配置AI接口，无法生成概括。</div>';
                        return;
                    }
                    const resp = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${key}`
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [
                                { role: 'system', content: '你是一个新闻摘要助手，请用简洁中文总结用户提供的新闻内容。' },
                                { role: 'user', content: content }
                            ],
                            temperature: 0.5
                        })
                    });
                    const contentType = resp.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const data = await resp.json();
                        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
                            aiSummary = data.choices[0].message.content.trim();
                        } else {
                            aiSummary = 'AI生成失败：' + (data.error?.message || '无返回');
                        }
                    } else {
                        const text = await resp.text();
                        aiSummary = 'AI接口返回非JSON内容：' + text.slice(0, 120);
                    }
                    originalDiv.innerHTML = `<div style='white-space:pre-line;font-size:1.08em;line-height:1.7;'><b>AI生成概括：</b><br>${aiSummary}</div>`;
                } catch (err) {
                    originalDiv.innerHTML = `<div style='color:#c00;'>AI生成失败：${err.message}</div>`;
                }
            };
        }
        // 阅读原文按钮事件
        const showOriginalBtn = document.getElementById('showOriginalBtn');
        if (showOriginalBtn) {
            showOriginalBtn.onclick = async () => {
                const originalDiv = document.getElementById('originalArticle');
                if (!originalDiv) return;
                if (!content) content = await this.getNewsContent(news);
                if (!content) {
                    content = '暂无原文内容';
                }
                originalDiv.innerHTML = `<div style='white-space:pre-line;font-size:1.08em;line-height:1.7;'><b>原文内容：</b><br>${content}</div>`;
                originalDiv.style.display = 'block';
            };
        }
        this.showDetailPanel();
    }

    showDetailPanel() {
        const detailPanel = document.getElementById('detailPanel');
        if (detailPanel) {
            detailPanel.classList.add('active');
            detailPanel.style.display = 'block';
        }
    }
    closeDetailPanel() {
        const detailPanel = document.getElementById('detailPanel');
        if (detailPanel) {
            detailPanel.classList.remove('active');
            detailPanel.style.display = 'none';
        }
    }
}

// 初始化应用
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new NewsMapApp();
});

// 全局函数供HTML调用
window.app = app; 