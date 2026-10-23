const mongoose = require('mongoose');

const scheduleBlockSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [1, 'Title cannot be empty'],
      maxlength: [120, 'Title cannot exceed 120 characters']
    },
    startTime: {
      type: Date,
      required: [true, 'startTime is required'],
      index: true
    },
    endTime: {
      type: Date,
      required: [true, 'endTime is required'],
      index: true
    },
    category: {
      type: String,
      enum: {
        values: ['focus', 'meeting', 'break', 'routine'],
        message: '{VALUE} is not a supported category'
      },
      default: 'focus'
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high'],
        message: '{VALUE} is not a supported priority'
      },
      default: 'medium'
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Schema-level validation hook: ensure endTime > startTime
scheduleBlockSchema.pre('validate', function (next) {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate('endTime', 'endTime must be strictly after startTime');
  }
  next();
});

const ScheduleBlock = mongoose.model('ScheduleBlock', scheduleBlockSchema);

module.exports = ScheduleBlock;
