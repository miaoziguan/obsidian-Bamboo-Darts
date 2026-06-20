import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/utils/tokenizer';

// ─── 校正函数候选 ───

type CorrectionFn = (unique: number, total: number) => number;

const corrections: Record<string, CorrectionFn> = {
  f0_raw: (u, t) => u / t,
  f1_log10_div2: (u, t) => Math.min((u / t) * Math.max(1, Math.log10(t) / 2), 1),
  f2_log2_div3: (u, t) => Math.min((u / t) * Math.max(1, Math.log2(t) / 3), 1),
  f3_log10_div3: (u, t) => Math.min((u / t) * Math.max(1, Math.log10(t) / 3), 1),
  f4_additive: (u, t) => Math.min((u / t) * (1 + 0.15 * Math.log10(t)), 1),
  f5_sqrt_log10: (u, t) => Math.min((u / t) * Math.max(1, Math.sqrt(Math.log10(t))), 1),
};

function computeDensity(text: string): { total: number; unique: number; densities: Record<string, number> } {
  const tokenMap = tokenize(text, { ngramSize: 2 });
  const total = Array.from(tokenMap.values()).reduce((a, b) => a + b, 0);
  const unique = tokenMap.size;
  const densities: Record<string, number> = {};
  for (const [name, fn] of Object.entries(corrections)) {
    densities[name] = total > 0 ? fn(unique, total) : 0;
  }
  return { total, unique, densities };
}

// ─── 标注样本 ───

interface Sample {
  label: 'NORMAL' | 'SPAM';
  category: string;
  text: string;
}

const samples: Sample[] = [
  // ── 正常短文 (200-500字) ──
  {
    label: 'NORMAL', category: '正常短文',
    text: '今天读了一篇关于城市绿化的文章，作者从多个角度分析了公园设计对居民幸福感的影响。研究表明，步行可达的绿地空间能显著降低压力水平，尤其是带有水景和步道的公园效果更佳。城市规划者应该优先考虑社区级绿地的均衡分布，而非只建设大型中央公园。此外，垂直绿化和屋顶花园也是高密度城区的有效补充方案。',
  },
  {
    label: 'NORMAL', category: '正常短文',
    text: '周末去了趟杭州西湖，人山人海但风景确实美。断桥残雪虽然没有雪，但湖面上的雾气很有意境。午饭在楼外楼吃的西湖醋鱼，味道一般但环境不错。下午骑车绕了苏堤一圈，柳树刚发芽，嫩绿色特别好看。晚上在河坊街逛了逛，买了些龙井茶带回去送人。下次想秋天再来，据说满觉陇的桂花很香。',
  },
  {
    label: 'NORMAL', category: '正常短文',
    text: '最近在学习 Rust 语言，所有权系统确实比其他语言严格很多。编译器的错误提示非常详细，虽然一开始觉得很烦，但习惯了之后发现它确实在帮你避免很多内存安全问题。生命周期标注是最难的部分，尤其是涉及多个引用互相引用的场景。不过一旦编译通过，运行时的稳定性让人很有信心。推荐给想做系统编程的朋友试试。',
  },

  // ── 正常中文 (1000-3000字) ──
  {
    label: 'NORMAL', category: '正常中文',
    text: '人工智能在教育领域的应用正在经历一场深刻的变革。传统的课堂教学模式面临着个性化需求难以满足的挑战，而 AI 技术为实现因材施教提供了新的可能性。自适应学习系统通过分析学生的答题模式、错误类型和学习节奏，动态调整教学内容的难度和呈现方式。这种系统能够识别每个学生的知识薄弱点，针对性地提供练习和解释，而不是采用一刀切的教学方案。自然语言处理技术的进步使得 AI 辅导系统能够理解和回应学生的问题，提供即时反馈。在数学教育中，AI 可以分析学生的解题步骤，找出逻辑错误并给出纠正建议。在语言学习中，语音识别和自然语言生成技术能够提供沉浸式的口语练习环境，帮助学生克服开口说话的障碍。然而，AI 教育也面临着不容忽视的挑战。数据隐私是一个核心问题——学习系统收集的大量学生数据如何存储、使用和保护，需要严格的法规和透明的政策。技术鸿沟可能加剧教育不平等，经济条件较差的学校可能无法负担先进的 AI 教学工具。此外，过度依赖技术可能削弱师生之间的人际互动，而教育的本质不仅是知识传递，还包括价值观塑造和情感交流。展望未来，最理想的模式可能是人机协作——AI 处理知识传递和个性化练习，教师专注于启发思考、培养创造力和提供情感支持。这种分工能够发挥各自的优势，让教育既有科技的效率，又有人文的温度。',
  },
  {
    label: 'NORMAL', category: '正常中文',
    text: '中国的咖啡消费市场规模在过去五年内增长了三倍以上，从一线城市逐渐向二三线城市渗透。上海已经成为全球咖啡馆数量最多的城市，拥有超过八千家独立咖啡馆和品牌连锁店。这种增长背后是年轻消费群体的生活方式转变——咖啡不再仅仅是一种饮品，而是社交、工作和自我表达的场景载体。本土咖啡品牌如瑞幸、Manner 通过数字化运营和极致性价比策略迅速扩张，改变了以往星巴克一家独大的市场格局。云南咖啡豆的品质提升也为国产咖啡品牌提供了差异化竞争力，越来越多的精品咖啡馆开始主打云南产区单品。咖啡文化还带动了周边产业的发展，包括咖啡器具、烘焙培训、咖啡旅游等细分市场。然而，行业也面临着激烈的价格战和盈利难题。低价策略虽然能够快速获客，但长期来看可能压缩整个产业链的利润空间。如何在规模扩张和品质维持之间找到平衡，是每一家咖啡企业都需要思考的战略问题。供应链的稳定性和可追溯性也越来越受到消费者关注，从种植、加工到烘焙的每一个环节都可能成为品牌故事的一部分。未来，咖啡市场的竞争将不仅是产品和价格的竞争，更是文化认同和消费体验的竞争。',
  },

  // ── 正常长文 (5000-10000字) ──
  {
    label: 'NORMAL', category: '正常长文',
    text: Array.from({ length: 12 }, (_, i) => {
      const topics = [
        '分布式系统中的共识算法是保证数据一致性的核心技术。Paxos 和 Raft 是两种广泛使用的共识协议，它们在安全性保证上等价，但 Raft 的可理解性更强，因此在新项目中更受欢迎。Raft 协议将共识问题分解为领导者选举、日志复制和安全性三个子问题，每个子问题都有明确的解决机制。在实际部署中，网络分区是最常见的故障场景，Raft 的多数派投票机制确保了在少数节点故障时系统仍能正常运作。',
        '容器编排平台 Kubernetes 的设计哲学体现了 Google 多年运维经验的沉淀。Pod 作为最小调度单元，封装了一个或多个紧密关联的容器，共享网络和存储命名空间。Service 抽象了服务发现和负载均衡，使得应用可以在不关心底层 Pod 变化的情况下保持稳定通信。Deployment 控制器实现了声明式的滚动更新，运维人员只需描述期望状态，系统自动完成从旧版本到新版本的平滑过渡。',
        '微服务架构中的服务间通信是系统设计的关键决策点。同步通信通常使用 gRPC 或 REST API，前者基于 Protocol Buffers 提供高效的二进制序列化和强类型接口定义，后者基于 JSON 提供更好的可读性和工具生态。异步通信通过消息队列实现解耦，Kafka 和 RabbitMQ 是两种主流选择。Kafka 适合高吞吐量的事件流处理场景，RabbitMQ 适合需要复杂路由和消息确认的业务场景。',
        '数据库索引优化的核心在于理解查询模式和访问路径。B+ 树索引适合范围查询和排序操作，哈希索引适合等值查询。复合索引的列顺序直接影响查询效率——应将区分度最高的列放在最前面。覆盖索引可以避免回表查询，对于频繁执行的查询能显著提升性能。但索引不是越多越好，每个索引都增加了写入时的维护成本，需要在读取性能和写入性能之间做权衡。',
        '前端性能优化的核心指标是 LCP（Largest Contentful Paint）和 CLS（Cumulative Layout Shift）。LCP 优化涉及资源加载策略，包括关键 CSS 内联、非关键 JavaScript 延迟加载、图片懒加载和预连接。CLS 优化要求为所有媒体元素预留空间，避免布局抖动。代码分割和 Tree Shaking 能有效减少首屏 JavaScript 体积，HTTP/2 的多路复用和服务端推送进一步优化了资源加载时序。',
        '机器学习模型的部署上线只是第一步，持续监控才是保证模型质量的关键。数据漂移（Data Drift）指输入特征的分布随时间偏离训练时的分布，导致模型预测准确率下降。概念漂移（Concept Drift）指目标变量与输入特征之间的关系发生变化。监控方案需要设置统计检验（如 KS 检验）的告警阈值，配合自动化的模型再训练流程。特征存储（Feature Store）可以统一管理离线和在线特征，确保训练与推理的一致性。',
        '云原生安全的核心理念是将安全嵌入整个软件开发生命周期。基础设施即代码的安全扫描能够在部署前发现配置错误，如开放的安全组端口、未加密的存储桶。容器镜像扫描可以检测已知漏洞，Pod 安全策略限制了容器的权限范围。运行时安全监控通过 eBPF 等技术检测异常行为，如进程执行了不在白名单中的命令。零信任网络架构要求所有服务间通信都经过 mTLS 认证，消除了内网即安全的假设。',
        '推荐系统的演进从协同过滤到深度学习经历了三个主要阶段。第一阶段是基于用户和物品相似度的传统协同过滤，简单但有效，面临冷启动和稀疏性问题。第二阶段是矩阵分解和隐向量模型，通过将用户和物品映射到低维空间来捕捉隐含偏好。第三阶段是基于深度学习的序列推荐和多任务学习，能够捕捉用户兴趣的时序变化和融合多种异构信号。实时推荐需要在毫秒级延迟内完成从特征提取到排序的全流程，通常采用两阶段架构：召回层快速筛选候选集，排序层精排得到最终结果。',
        'API 网关是微服务架构中不可或缺的基础设施组件。它承担了请求路由、协议转换、认证鉴权、限流熔断等横切关注点。Kong 和 Envoy 是两种流行的开源 API 网关，前者基于 Nginx 提供了丰富的插件生态，后者作为云原生代理提供了细粒度的流量控制能力。API 版本管理是网关设计中的重要课题，URL 路径版本化和请求头版本化各有优劣。灰度发布通过流量分割和条件路由实现了渐进式上线，降低了变更风险。',
        '可观测性体系由指标（Metrics）、日志（Logs）和追踪（Traces）三大支柱构成。Prometheus 通过 Pull 模式采集时序指标，Grafana 提供可视化仪表盘。结构化日志通过 JSON 格式输出，便于日志聚合系统（如 ELK Stack）的索引和查询。分布式追踪（如 Jaeger、Zipkin）通过在请求链路中注入 Span ID，将跨服务调用串联为完整的调用图谱。OpenTelemetry 项目正在统一三种信号的采集标准，减少供应商锁定。',
        '边缘计算将数据处理从云端推向网络边缘，解决了延迟敏感型应用的实时性需求。在自动驾驶场景中，车辆需要在毫秒内做出避障决策，不可能等待云端响应。工业物联网场景中，传感器数据的本地预处理减少了带宽消耗和云端计算压力。边缘节点的资源受限性要求算法和模型必须轻量化，模型压缩技术如知识蒸馏和量化成为关键技术。边缘与云的协同架构中，边缘负责实时推理，云端负责模型训练和全局决策。',
        '量子计算在密码学领域引发了深刻的变革。Shor 算法在理论上能够在多项式时间内分解大整数，这意味着当前广泛使用的 RSA 加密在量子计算机面前将不再安全。NIST 已经启动了后量子密码标准化进程，基于格的密码学（如 Kyber、Dilithium）是目前最有前景的候选方案。量子密钥分发（QKD）利用量子力学的基本原理实现了理论上不可窃听的密钥交换，但实际部署面临着距离限制和中继器安全性问题。过渡期间，混合加密方案结合了传统密码和后量子密码的优势，提供了双重安全保障。',
      ];
      return topics[i];
    }).join('\n\n'),
  },

  // ── 技术文献 (2000-8000字) ──
  {
    label: 'NORMAL', category: '技术文献',
    text: `## TCP/IP 协议栈分析

TCP（Transmission Control Protocol）是互联网传输层的核心协议，提供可靠的、面向连接的字节流服务。TCP 的三次握手（SYN → SYN-ACK → ACK）建立了双向通信通道，四次挥手（FIN → ACK → FIN → ACK）优雅地关闭连接。

\`\`\`
Client                    Server
  |---SYN(seq=x)---------->|
  |<--SYN+ACK(seq=y,ack=x+1)-|
  |---ACK(ack=y+1)-------->|
\`\`\`

拥塞控制是 TCP 的关键机制。慢启动（Slow Start）阶段，拥塞窗口（cwnd）每收到一个 ACK 翻倍（指数增长）。当 cwnd 达到慢启动阈值（ssthresh）时进入拥塞避免阶段，cwnd 每个 RTT 线性增加一个 MSS。检测到丢包后，ssthresh 减半，cwnd 重置为 1 MSS，重新开始慢启动。

TCP Reno 和 TCP CUBIC 是两种广泛使用的拥塞控制算法。CUBIC 使用三次函数代替线性增长，在长肥管道（Long Fat Network）中能更快恢复吞吐量。BBR（Bottleneck Bandwidth and RTT）是 Google 开发的新型算法，基于带宽和延迟的测量而非丢包信号来调整发送速率。

Nagle 算法通过将小数据包缓冲后合并发送来减少网络中的小包数量，但在交互式应用（如 SSH、在线游戏）中会增加延迟。TCP_NODELAY 选项可以禁用 Nagle 算法。TCP Keepalive 机制通过定期发送探测包检测死连接，默认间隔为 2 小时，在生产环境中通常缩短到 60 秒。

MPTCP（Multipath TCP）允许单个 TCP 连接使用多条网络路径，提高了吞吐量和容错能力。在移动设备从 Wi-Fi 切换到蜂窝网络时，MPTCP 能保持连接不中断。QUIC 协议基于 UDP 实现了类似 TCP 的可靠性保证，但将连接建立和 TLS 握手合并为一个 RTT，显著降低了延迟。HTTP/3 选择 QUIC 作为传输层协议，解决了 TCP 队头阻塞问题。`,
  },
  {
    label: 'NORMAL', category: '技术文献',
    text: Array.from({ length: 8 }, (_, i) => {
      const sections = [
        'React 的虚拟 DOM（Virtual DOM）是一种轻量级的 DOM 表示方式。每次状态变更时，React 创建新的虚拟 DOM 树，通过 Diff 算法比较新旧树的差异（Reconciliation），仅将必要的变更应用到真实 DOM。Fiber 架构将渲染工作分解为可中断的小单元，使得高优先级更新（如用户输入）能够打断低优先级更新（如数据列表渲染），改善了交互响应性。',
        'Vue 3 的 Composition API 是对 Options API 的补充而非替代。setup() 函数提供了更灵活的逻辑组织方式，相关的响应式状态和计算属性可以聚合在一起，而非按照 data/computed/methods 分散。ref() 和 reactive() 分别处理基本类型和对象类型的响应式包装。watchEffect() 自动追踪依赖并执行副作用，简化了数据监听逻辑。',
        'TypeScript 的类型系统是图灵完备的，这意味着可以在类型层面实现复杂的逻辑。条件类型（Conditional Types）通过 extends 关键字实现类型分支判断。映射类型（Mapped Types）可以基于已有类型生成新类型。模板字面量类型（Template Literal Types）允许在类型系统中进行字符串操作。但过度使用高级类型会增加编译时间和代码理解成本，应在类型安全和可维护性之间取得平衡。',
        'Webpack 5 的 Module Federation 实现了跨应用的模块共享。远程模块（Remote）暴露指定模块供消费方（Host）使用，共享依赖通过 singleton 配置确保只加载一份。这种机制使得微前端架构中的子应用可以动态加载其他子应用的组件，实现了真正的运行时集成。与 qiankun 的沙箱隔离方案不同，Module Federation 更侧重于模块级别的粒度控制。',
        'CSS-in-JS 方案（如 styled-components、Emotion）在运行时生成样式，提供了动态样式和主题切换的灵活性，但引入了运行时开销和 SSR 兼容性问题。零运行时方案（如 Vanilla Extract、Linaria）在构建时提取 CSS，兼顾了类型安全和性能。Tailwind CSS 通过原子化 CSS 类名消除了样式文件的维护负担，但增加了 HTML 的复杂度。',
        'Server-Sent Events（SSE）是服务端向客户端推送数据的轻量方案。与 WebSocket 相比，SSE 只支持单向通信（服务端→客户端），但基于 HTTP 协议，无需额外的协议升级，天然兼容代理和防火墙。EventSource API 自动处理重连和消息 ID 追踪。对于需要双向通信的场景（如聊天、协同编辑），WebSocket 仍是更好的选择。gRPC-Web 通过 Envoy 代理提供了浏览器端的 gRPC 调用能力。',
        'GraphQL 的 N+1 查询问题是最常见的性能陷阱。当解析器逐条查询关联数据时，一个列表查询可能触发数百次数据库请求。DataLoader 通过批处理（Batching）和缓存（Caching）解决这个问题——将同一事件循环中的多个 load() 调用合并为一次批量查询。查询复杂度分析（Query Complexity Analysis）可以限制嵌套深度和字段数量，防止恶意查询耗尽服务端资源。',
        'WebAssembly（Wasm）为浏览器带来了接近原生的执行性能。Rust 和 C++ 编译为 Wasm 后可在浏览器沙箱中安全运行，适用于图像/视频处理、加密计算、物理模拟等 CPU 密集型任务。WASI（WebAssembly System Interface）将 Wasm 的能力扩展到浏览器之外，提供了文件系统和网络等系统接口。Wasm 组件模型正在定义模块间的标准化交互方式，有望成为跨语言、跨平台的通用二进制格式。',
      ];
      return sections[i];
    }).join('\n\n'),
  },

  // ── SEO 水文 (1000-5000字) ──
  {
    label: 'SPAM', category: 'SEO水文',
    text: '装修找我们就对了，专业装修公司为您提供一站式装修服务。我们的装修团队拥有丰富的装修经验，无论是家庭装修还是办公室装修，都能满足您的装修需求。装修公司哪家好？选择我们的装修公司，您将获得最优质的装修体验。我们的装修价格合理，装修质量有保障，装修效果让您满意。装修前免费咨询，装修中全程监理，装修后质保五年。装修风格多种多样，中式装修、欧式装修、现代简约装修，总有一款装修风格适合您。装修材料全部采用环保材料，装修过程透明公开，装修进度实时汇报。联系电话：400-XXX-XXXX，装修就找我们，装修无忧！专业装修团队，装修品质保证，装修价格公道，装修服务周到。装修热线24小时开通，装修咨询随时欢迎，装修预约享优惠。我们的装修案例遍布全城，装修口碑有目共睹，装修实力毋庸置疑。',
  },
  {
    label: 'SPAM', category: 'SEO水文',
    text: '减肥产品哪个效果好？这款减肥产品是目前最受欢迎的减肥神器。使用这款减肥产品，30天轻松减肥20斤。减肥方法千千万，但最有效的减肥方法就是使用我们的减肥产品。减肥不用节食，减肥不用运动，只需每天服用这款减肥产品，就能达到理想的减肥效果。减肥成功案例数不胜数，减肥效果看得见摸得着。这款减肥产品采用纯天然植物提取物，减肥安全无副作用，减肥不反弹。减肥期间的饮食搭配也很重要，我们的减肥顾问会为您提供专业的减肥食谱和减肥计划。想要减肥的朋友赶紧下单吧，减肥产品限时优惠，买二送一。减肥达人强烈推荐，减肥效果立竿见影。减肥不是一蹴而就的事情，但有了这款减肥产品，减肥变得轻松简单。减肥前后的对比照片真实展示，减肥效果令人惊叹。加入我们的减肥计划，和 thousands of 减肥成功者一起开启减肥之旅。减肥咨询热线：XXX-XXXX-XXXX。',
  },

  // ── 纯重复 (500-3000字) ──
  {
    label: 'SPAM', category: '纯重复',
    text: '测试数据内容信息处理分析学习系统方法技术研究开发平台框架设计方案实施过程管理优化改进提升效率降低成本提高质量保障安全可靠稳定运行。'.repeat(30),
  },
  {
    label: 'SPAM', category: '纯重复',
    text: '这是一段用于测试信息密度检测的重复内容，通过反复拼接相同的文本来模拟低质量的水文内容。'.repeat(50),
  },
  {
    label: 'SPAM', category: '纯重复',
    text: '关键词堆砌 关键词堆砌 关键词堆砌 SEO优化 SEO优化 SEO优化 排名提升 排名提升 搜索引擎优化 搜索引擎优化 百度排名 百度排名 网站推广 网站推广 流量提升 流量提升 关键词堆砌 关键词堆砌 SEO优化 SEO优化 排名提升 排名提升 搜索引擎优化 搜索引擎优化 百度排名 百度排名 网站推广 网站推广 流量提升 流量提升'.repeat(15),
  },
];

// ─── 校准实验 ───

describe('density calibration', () => {
  it('应输出所有样本在各校正函数下的密度分布', () => {
    const results = samples.map(s => {
      const { total, unique, densities } = computeDensity(s.text);
      return {
        label: s.label,
        category: s.category,
        length: s.text.length,
        total,
        unique,
        rawDensity: (unique / total).toFixed(4),
        ...Object.fromEntries(
          Object.entries(densities).map(([k, v]) => [k, v.toFixed(4)])
        ),
      };
    });

    console.log('\n═══════════════════════════════════════════════');
    console.log('密度校准实验结果');
    console.log('═══════════════════════════════════════════════\n');

    // 按类别分组输出
    const categories = [...new Set(results.map(r => r.category))];
    for (const cat of categories) {
      const catResults = results.filter(r => r.category === cat);
      const label = catResults[0].label;
      console.log(`── ${label} / ${cat} ──`);
      for (const r of catResults) {
        console.log(`  长度=${r.length} tokens=${r.total} unique=${r.unique} raw=${r.rawDensity}`);
        console.log(`    f1(log10/2)=${r.f1_log10_div2}  f2(log2/3)=${r.f2_log2_div3}  f3(log10/3)=${r.f3_log10_div3}  f4(add)=${r.f4_additive}  f5(sqrt)=${r.f5_sqrt_log10}`);
      }
      console.log('');
    }

    // 计算分离度
    console.log('── 分离度分析 ──');
    const normalSamples = results.filter(r => r.label === 'NORMAL');
    const spamSamples = results.filter(r => r.label === 'SPAM');

    for (const fnName of Object.keys(corrections)) {
      const normalDensities = normalSamples.map(r => parseFloat((r as any)[fnName]));
      const spamDensities = spamSamples.map(r => parseFloat((r as any)[fnName]));
      const minNormal = Math.min(...normalDensities);
      const maxSpam = Math.max(...spamDensities);
      const separation = minNormal - maxSpam;

      // 用 balanced profile 的阈值计算 FPR/FNR
      const BLOCK_THRESHOLD = 0.10;
      const WARN_THRESHOLD = 0.30;
      const fpr = normalDensities.filter(d => d < BLOCK_THRESHOLD).length / normalDensities.length;
      const fnr = spamDensities.filter(d => d >= BLOCK_THRESHOLD).length / spamDensities.length;

      console.log(`  ${fnName}: separation=${separation.toFixed(4)} minNormal=${minNormal.toFixed(4)} maxSpam=${maxSpam.toFixed(4)} FPR=${(fpr*100).toFixed(0)}% FNR=${(fnr*100).toFixed(0)}%`);
    }

    console.log('\n═══════════════════════════════════════════════\n');

    expect(true).toBe(true);
  });
});
