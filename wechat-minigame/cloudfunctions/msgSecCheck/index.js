const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
    const { content } = event;
    
    if (!content || typeof content !== 'string') {
        return { risky: false };
    }

    try {
        const res = await cloud.openapi.security.msgSecCheck({
            openid: cloud.getWXContext().OPENID,
            scene: 1, // 1 = profile (nickname)
            version: 2,
            content: content
        });
        
        // result.suggest: 'pass' | 'review' | 'risky'
        if (res.result && (res.result.suggest === 'risky' || res.result.suggest === 'review')) {
            return { risky: true, label: res.result.label };
        }
        return { risky: false };
    } catch (e) {
        console.error('msgSecCheck error:', e);
        // On error, let it pass to avoid blocking legitimate users
        return { risky: false };
    }
};
