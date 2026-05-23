package com.example.videotrimmerge.view

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View

class RangeTrimBar @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val density = context.resources.displayMetrics.density
    private val thumbW = 14f * density
    private val minGapMs = 500L

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#33FFFFFF")
        style = Paint.Style.FILL
    }
    private val selectedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#FF6B35")
        style = Paint.Style.FILL
    }
    private val dimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#AA000000")
        style = Paint.Style.FILL
    }
    private val thumbPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.FILL
    }
    private val posPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#FFFFFFFF")
        strokeWidth = 3f * density
        style = Paint.Style.STROKE
    }
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#FF6B35")
        strokeWidth = 3f * density
        style = Paint.Style.STROKE
    }

    private var durationMs: Long = 1
    private var startMs: Long = 0
    private var endMs: Long = 1
    private var positionMs: Long = 0

    private enum class Drag { NONE, START, END }
    private var drag = Drag.NONE
    private val touchSlop = 28f * density

    var onRangeChanged: ((startMs: Long, endMs: Long) -> Unit)? = null

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        val tLeft = thumbW
        val tRight = w - thumbW
        val tWidth = tRight - tLeft
        if (tWidth <= 0 || durationMs <= 0) return

        val sx = tLeft + (startMs.toFloat() / durationMs) * tWidth
        val ex = tLeft + (endMs.toFloat() / durationMs) * tWidth
        val px = tLeft + (positionMs.toFloat() / durationMs) * tWidth

        // Full background
        canvas.drawRect(tLeft, 0f, tRight, h, bgPaint)
        // Dimmed outside selection
        canvas.drawRect(tLeft, 0f, sx, h, dimPaint)
        canvas.drawRect(ex, 0f, tRight, h, dimPaint)
        // Selected region border
        canvas.drawRect(sx, 0f, ex, h, selectedPaint.apply { alpha = 40 })
        canvas.drawRect(sx, 0f, ex, h, borderPaint)

        // Left thumb
        canvas.drawRect(sx - thumbW, 0f, sx, h, thumbPaint)
        // Right thumb
        canvas.drawRect(ex, 0f, ex + thumbW, h, thumbPaint)

        // Position indicator
        canvas.drawLine(px.coerceIn(tLeft, tRight), 0f, px.coerceIn(tLeft, tRight), h, posPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val tLeft = thumbW
        val tRight = width - thumbW
        val tWidth = tRight - tLeft
        if (tWidth <= 0 || durationMs <= 0) return false

        val sx = tLeft + (startMs.toFloat() / durationMs) * tWidth
        val ex = tLeft + (endMs.toFloat() / durationMs) * tWidth

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                drag = when {
                    kotlin.math.abs(event.x - sx) <= touchSlop -> Drag.START
                    kotlin.math.abs(event.x - ex) <= touchSlop -> Drag.END
                    else -> Drag.NONE
                }
                if (drag != Drag.NONE) {
                    parent.requestDisallowInterceptTouchEvent(true)
                    return true
                }
                return false
            }
            MotionEvent.ACTION_MOVE -> {
                if (drag == Drag.NONE) return false
                val frac = ((event.x - tLeft) / tWidth).coerceIn(0f, 1f)
                val ms = (frac * durationMs).toLong()
                when (drag) {
                    Drag.START -> startMs = ms.coerceIn(0, endMs - minGapMs)
                    Drag.END -> endMs = ms.coerceIn(startMs + minGapMs, durationMs)
                    Drag.NONE -> Unit
                }
                invalidate()
                onRangeChanged?.invoke(startMs, endMs)
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                parent.requestDisallowInterceptTouchEvent(false)
                drag = Drag.NONE
                return true
            }
        }
        return false
    }

    fun setDuration(ms: Long) {
        durationMs = maxOf(ms, 1)
        startMs = 0
        endMs = durationMs
        invalidate()
    }

    fun setRange(startMs: Long, endMs: Long) {
        this.startMs = startMs
        this.endMs = endMs
        invalidate()
    }

    fun setPosition(ms: Long) {
        positionMs = ms
        invalidate()
    }

    fun getStartMs() = startMs
    fun getEndMs() = endMs
}
