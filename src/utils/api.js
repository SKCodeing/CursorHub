/**
 * src/main/api.js
 * 该文件用于集中处理所有通过 IPC 调用转发过来的 API 请求。
 * 使用原生 Node.js https 模块直接发请求，完全绕开 Electron 的 Chromium 网络栈。
 */
import https from "https";
import http from "http";
import { URL } from "url";

/**
 * 用原生 Node.js https/http 模块发请求，支持手动重定向
 */
function rawRequest(options, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            return reject(new Error("超过最大重定向次数"));
        }

        const url = new URL(options.url);
        const isHttps = url.protocol === "https:";
        const lib = isHttps ? https : http;

        const reqOptions = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + (url.search || ""),
            method: (options.method || "GET").toUpperCase(),
            headers: options.headers || {},
        };

        const req = lib.request(reqOptions, (res) => {
            // 处理重定向，保留原始 headers
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                const location = res.headers.location;
                const redirectUrl = location.startsWith("http")
                    ? location
                    : new URL(location, options.url).href;
                const redirectMethod = [307, 308].includes(res.statusCode)
                    ? options.method
                    : "GET";
                console.log(`[api] redirect(${redirectCount + 1}) → ${redirectUrl} → ...`);
                // 消费掉响应体，避免 socket hang
                res.resume();
                return resolve(rawRequest({ ...options, url: redirectUrl, method: redirectMethod }, redirectCount + 1));
            }

            let data = [];
            res.on("data", (chunk) => data.push(chunk));
            res.on("end", () => {
                const body = Buffer.concat(data).toString("utf8");
                let parsed;
                try {
                    parsed = JSON.parse(body);
                } catch {
                    parsed = body;
                }
                resolve({ status: res.statusCode, data: parsed, headers: res.headers });
            });
        });

        req.on("error", reject);

        if (options.data) {
            const body = typeof options.data === "string" ? options.data : JSON.stringify(options.data);
            req.write(body);
        }

        req.end();
    });
}

/**
 * 通用的 API 请求处理器
 */
export async function handleApiRequest(options) {
    try {
        const response = await rawRequest(options);
        console.log(`[api] ${(options.method || "GET").toUpperCase()} ${options.url} → ${response.status}`);
        // 打印实际发送的 Cookie 前80字符，用于排查
        if (options.headers?.Cookie) {
            console.log(`[api] Cookie sent:`, decodeURIComponent(options.headers.Cookie).slice(0, 120));
        }

        if (response.status >= 400) {
            console.error(`[api] error:`, JSON.stringify(response.data).slice(0, 200));
            return {
                success: false,
                error: {
                    message: `请求失败，状态码: ${response.status}`,
                    status: response.status,
                    data: response.data,
                },
            };
        }

        return {
            success: true,
            data: response.data,
            status: response.status,
            headers: response.headers,
        };
    } catch (error) {
        console.error(`API请求失败: ${error.message}`);
        return {
            success: false,
            error: {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
                code: error.code,
            },
        };
    }
}
