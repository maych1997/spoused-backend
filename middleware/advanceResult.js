const advancedResults = (model, populate) => async (req, res, next) => {
    let query

    // Copy req.query
    const reqQuery = { ...req.query }

    // Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit', 'pro'] // Add 'isPro' to the list of fields to remove

    // Loop over removeFields and delete them from reqQuery
    removeFields.forEach((param) => delete reqQuery[param])

    // Handle isPro separately
    let isProFilter = {}
    if (req.query.pro) {
        isProFilter = { proAccount: req.query.pro === 'true' } // Convert string to boolean and build isPro filter
    }

    // Create query string
    let queryStr = JSON.stringify({ ...reqQuery, ...isProFilter })

    // Create operators ($gt, $gte, etc)
    queryStr = queryStr.replace(
        /\b(gt|gte|lt|lte|in)\b/g,
        (match) => `$${match}`,
    )

    // Finding resource
    query = model.find(JSON.parse(queryStr))

    // Select Fields
    if (req.query.select) {
        const fields = req.query.select.split(',').join(' ')
        query = query.select(fields)
    }

    // Sort
    if (req.query.sort) {
        const sortBy = req.query.sort.split(',').join(' ')
        query = query.sort(sortBy)
    } else {
        query = query.sort('-createdAt')
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1
    const limit = parseInt(req.query.limit, 10) || 25
    const startIndex = (page - 1) * limit
    const endIndex = page * limit
    const total = await model.countDocuments(JSON.parse(queryStr)) // Ensure countDocuments uses the same query

    query = query.skip(startIndex).limit(limit)

    if (populate) {
        query = query.populate(populate)
    }

    // Executing query
    const results = await query

    // Pagination result
    const pagination = {}

    if (endIndex < total) {
        pagination.next = {
            page: page + 1,
            limit,
        }
    }

    if (startIndex > 0) {
        pagination.prev = {
            page: page - 1,
            limit,
        }
    }

    res.advancedResults = {
        success: true,
        count: results.length,
        pagination,
        data: results,
    }

    next()
}

module.exports = advancedResults
