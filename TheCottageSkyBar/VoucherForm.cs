using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Data.OleDb;

namespace TheCottageSkyBar
{
    public partial class VoucherForm : Form
    {
        public VoucherForm()
        {
            InitializeComponent();
        }

        private void button1_Click(object sender, EventArgs e)
        {
            try
            {
                Convert.ToInt32(textBox1.Text);
                if (checkVoucher())
                {
                    MessageBox.Show("Voucher หมายเลข " + textBox1.Text + " สามารถ 'ใช้ได้' ในวันนี้");
                    textBox1.Text = "";
                    this.ActiveControl = textBox1;
                }
                else
                {
                    MessageBox.Show("Voucher หมายเลข " + textBox1.Text + " 'ไม่' สามารถใช้ในวันนี้ได้");
                    textBox1.Text = "";
                    this.ActiveControl = textBox1;
                }
            }
            catch (Exception)
            {
                MessageBox.Show("เลข Voucher ไม่ถูกต้อง");
                textBox1.Text = "";
                this.ActiveControl = textBox1;
            }
        }

        private bool checkVoucher()
        {
            int _isexist = 0;
            string strSQL = "SELECT COUNT(ID) as isFound FROM VOUCHER WHERE DATE1=#" + Form1.getDateTime(DateTime.Now.ToShortDateString()) + "# AND ID=" + textBox1.Text + " and Status=0";
            OleDbConnection connection = new OleDbConnection(Form1.VoucherconnStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
            {
                try
                {
                    _isexist = Convert.ToInt16(reader["isFound"].ToString());
                }
                catch (Exception)
                {

                }
            }
            reader.Close();
            connection.Close();
            if (_isexist != 0)
                return true;
            else
                return false;
        }

        private void button2_Click(object sender, EventArgs e)
        {
            this.Close();

        }

        private void VoucherForm_Load(object sender, EventArgs e)
        {
            this.ActiveControl = textBox1;
        }
    }
}
