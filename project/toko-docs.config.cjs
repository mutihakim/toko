module.exports = {
    apps: [{
        name: "toko-docs",
        script: "npx",
        args: "http-server ../docs/.vitepress/dist -p 8017",
        cwd: __dirname
    }]
};
